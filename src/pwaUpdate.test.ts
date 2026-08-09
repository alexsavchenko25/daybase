import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CHECK_DEBOUNCE_MS,
  INITIAL_CHECK_DELAY_MS,
  createPwaUpdateController,
  type PwaUpdateController,
  type UpdatableRegistration,
} from "./pwaUpdate";

// Fake-Registrierung: bildet nur ab, was der Controller wirklich anfasst
// (update/waiting/installing) — so bleiben die Tests ohne jsdom lauffähig.
function fakeRegistration(
  behaviour: {
    onUpdate?: (reg: MutableRegistration) => void | Promise<void>;
    reject?: boolean;
  } = {},
) {
  const reg: MutableRegistration = {
    calls: 0,
    waiting: undefined,
    installing: undefined,
    update: async () => {
      reg.calls++;
      if (behaviour.reject) throw new Error("network down");
      await behaviour.onUpdate?.(reg);
    },
  };
  return reg;
}

interface MutableRegistration extends UpdatableRegistration {
  calls: number;
  waiting?: unknown;
  installing?: unknown;
}

function makeController(options: { online?: boolean; supported?: boolean } = {}) {
  let clock = 1_000;
  const controller = createPwaUpdateController({
    now: () => clock,
    isOnline: () => options.online ?? true,
    supported: options.supported ?? true,
  });
  return {
    controller,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

let active: PwaUpdateController | null = null;
afterEach(() => {
  active?.dispose();
  active = null;
  vi.useRealTimers();
});

describe("initial state", () => {
  test("starts unavailable until a registration arrives", () => {
    const { controller } = makeController();
    active = controller;
    expect(controller.getSnapshot()).toEqual({
      state: "unavailable",
      lastCheckedAt: null,
      hasRegistration: false,
      supported: true,
    });
  });

  test("reports unsupported browsers as unavailable", () => {
    const { controller } = makeController({ supported: false });
    active = controller;
    expect(controller.getSnapshot().supported).toBe(false);
    expect(controller.getSnapshot().state).toBe("unavailable");
  });

  test("a check without service worker support does nothing and stays unavailable", async () => {
    const { controller } = makeController({ supported: false });
    active = controller;
    await controller.checkForUpdate({ force: true });
    expect(controller.getSnapshot().state).toBe("unavailable");
    expect(controller.getSnapshot().lastCheckedAt).toBeNull();
  });
});

describe("registration becoming available", () => {
  test("moves to idle and schedules the initial check", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const reg = fakeRegistration();

    controller.setRegistration(reg);
    expect(controller.getSnapshot().state).toBe("idle");
    expect(controller.getSnapshot().hasRegistration).toBe(true);
    expect(reg.calls).toBe(0);

    await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS + 10);
    expect(reg.calls).toBe(1);
    expect(controller.getSnapshot().state).toBe("upToDate");
  });

  test("an already waiting worker is reported as available immediately", () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const reg = fakeRegistration();
    reg.waiting = {};

    controller.setRegistration(reg);
    expect(controller.getSnapshot().state).toBe("available");
  });

  test("clearing the registration returns to unavailable", () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    controller.setRegistration(fakeRegistration());
    controller.setRegistration(null);
    expect(controller.getSnapshot().state).toBe("unavailable");
    expect(controller.getSnapshot().hasRegistration).toBe(false);
  });
});

describe("checking for updates", () => {
  test("a successful check with no update reports upToDate and a timestamp", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    controller.setRegistration(fakeRegistration());

    await controller.checkForUpdate({ force: true });
    const snap = controller.getSnapshot();
    expect(snap.state).toBe("upToDate");
    expect(snap.lastCheckedAt).toBe(1_000);
  });

  test("a waiting worker after the check reports available", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const reg = fakeRegistration({
      onUpdate: (r) => {
        r.waiting = {};
      },
    });
    controller.setRegistration(reg);

    await controller.checkForUpdate({ force: true });
    expect(controller.getSnapshot().state).toBe("available");
  });

  test("a still-installing worker also counts as available", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const reg = fakeRegistration({
      onUpdate: (r) => {
        r.installing = {};
      },
    });
    controller.setRegistration(reg);

    await controller.checkForUpdate({ force: true });
    expect(controller.getSnapshot().state).toBe("available");
  });

  test("a failed check reports error and never claims to be current", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    controller.setRegistration(fakeRegistration({ reject: true }));

    await controller.checkForUpdate({ force: true });
    expect(controller.getSnapshot().state).toBe("error");
    expect(controller.getSnapshot().lastCheckedAt).toBeNull();
  });

  test("offline is reported without touching the registration", async () => {
    vi.useFakeTimers();
    const { controller } = makeController({ online: false });
    active = controller;
    const reg = fakeRegistration();
    controller.setRegistration(reg);

    await controller.checkForUpdate({ force: true });
    expect(controller.getSnapshot().state).toBe("offline");
    expect(reg.calls).toBe(0);
    expect(controller.getSnapshot().lastCheckedAt).toBeNull();
  });

  test("needRefresh from the service worker flips the state to available", () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    controller.setRegistration(fakeRegistration());

    controller.markUpdateAvailable();
    expect(controller.getSnapshot().state).toBe("available");
  });

  test("a registration error is surfaced without a stack trace", () => {
    const { controller } = makeController();
    active = controller;
    controller.markRegistrationError();
    expect(controller.getSnapshot().state).toBe("error");
  });
});

describe("parallel checks and debouncing", () => {
  test("a second check while one is in flight is ignored", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reg = fakeRegistration({ onUpdate: () => gate });
    controller.setRegistration(reg);

    const first = controller.checkForUpdate({ force: true });
    expect(controller.getSnapshot().state).toBe("checking");
    await controller.checkForUpdate({ force: true }); // parallel → ignoriert
    expect(reg.calls).toBe(1);

    release();
    await first;
    expect(reg.calls).toBe(1);
    expect(controller.getSnapshot().state).toBe("upToDate");
  });

  test("automatic checks within the debounce window collapse into one", async () => {
    vi.useFakeTimers();
    const { controller, advance } = makeController();
    active = controller;
    const reg = fakeRegistration();
    controller.setRegistration(reg);

    await controller.checkForUpdate(); // läuft
    expect(reg.calls).toBe(1);
    await controller.checkForUpdate(); // zu früh → entprellt
    await controller.checkForUpdate();
    expect(reg.calls).toBe(1);

    advance(CHECK_DEBOUNCE_MS + 1);
    await controller.checkForUpdate();
    expect(reg.calls).toBe(2);
  });

  test("a manual check bypasses the debounce window", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const reg = fakeRegistration();
    controller.setRegistration(reg);

    await controller.checkForUpdate();
    await controller.checkForUpdate({ force: true });
    expect(reg.calls).toBe(2);
  });
});

describe("installing", () => {
  test("installs once and reports the installing state", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const install = vi.fn().mockResolvedValue(undefined);
    controller.setRegistration(fakeRegistration());
    controller.setInstaller(install);
    controller.markUpdateAvailable();

    await controller.installUpdate();
    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith(true);
    expect(controller.getSnapshot().state).toBe("installing");
  });

  test("repeated install requests never trigger a second reload", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const install = vi.fn().mockResolvedValue(undefined);
    controller.setRegistration(fakeRegistration());
    controller.setInstaller(install);

    await controller.installUpdate();
    await controller.installUpdate();
    await controller.installUpdate();
    expect(install).toHaveBeenCalledTimes(1);
  });

  test("does nothing when no installer has been published yet", async () => {
    const { controller } = makeController();
    active = controller;
    await controller.installUpdate();
    expect(controller.getSnapshot().state).toBe("unavailable");
  });

  test("without a registration it never gets stuck in installing (dev case)", async () => {
    // useRegisterSW liefert updateServiceWorker auch ohne Service Worker
    // zurück — ohne Registrierungs-Prüfung bliebe der Zustand hängen.
    const { controller } = makeController();
    active = controller;
    const install = vi.fn().mockResolvedValue(undefined);
    controller.setInstaller(install);

    await controller.installUpdate();
    expect(install).not.toHaveBeenCalled();
    expect(controller.getSnapshot().state).toBe("unavailable");
  });

  test("a failed installation surfaces an error and allows a retry", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const install = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    controller.setRegistration(fakeRegistration());
    controller.setInstaller(install);

    await controller.installUpdate();
    expect(controller.getSnapshot().state).toBe("error");
    await controller.installUpdate();
    expect(install).toHaveBeenCalledTimes(2);
  });

  test("checks are suppressed while an installation is running", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const reg = fakeRegistration();
    controller.setRegistration(reg);
    controller.setInstaller(vi.fn().mockResolvedValue(undefined));

    await controller.installUpdate();
    const before = reg.calls;
    await controller.checkForUpdate({ force: true });
    expect(reg.calls).toBe(before);
    expect(controller.getSnapshot().state).toBe("installing");
  });

  test("needRefresh during installation does not downgrade the state", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    controller.setRegistration(fakeRegistration());
    controller.setInstaller(vi.fn().mockResolvedValue(undefined));

    await controller.installUpdate();
    controller.markUpdateAvailable();
    expect(controller.getSnapshot().state).toBe("installing");
  });
});

describe("subscribers and cleanup", () => {
  test("notifies subscribers only on real state changes", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const seen = vi.fn();
    const unsubscribe = controller.subscribe(seen);
    controller.setRegistration(fakeRegistration());
    const afterRegistration = seen.mock.calls.length;
    expect(afterRegistration).toBeGreaterThan(0);

    // Gleicher Zustand erneut gesetzt → kein zusätzlicher Re-Render.
    controller.markRegistrationError();
    controller.markRegistrationError();
    expect(seen.mock.calls.length).toBe(afterRegistration + 1);

    unsubscribe();
    controller.markUpdateAvailable();
    expect(seen.mock.calls.length).toBe(afterRegistration + 1);
  });

  test("getSnapshot keeps referential identity while nothing changes", () => {
    const { controller } = makeController();
    active = controller;
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
  });

  test("dispose clears the pending initial check timer", async () => {
    vi.useFakeTimers();
    const { controller } = makeController();
    active = controller;
    const reg = fakeRegistration();
    controller.setRegistration(reg);

    controller.dispose();
    await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS + 50);
    expect(reg.calls).toBe(0);
  });
});
