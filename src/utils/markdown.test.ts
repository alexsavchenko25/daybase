import { describe, expect, test } from "vitest";
import { isSafeUrl, parseBlocks, parseInline } from "./markdown";

describe("parseBlocks", () => {
  test("erkennt Headings 1-6", () => {
    expect(parseBlocks("# H1")).toEqual([{ kind: "heading", level: 1, text: "H1" }]);
    expect(parseBlocks("### H3")).toEqual([{ kind: "heading", level: 3, text: "H3" }]);
  });

  test("'#ohne Leerzeichen' ist kein Heading, sondern Absatz", () => {
    expect(parseBlocks("#foo")).toEqual([{ kind: "paragraph", text: "#foo" }]);
  });

  test("Fenced Code Block behält Inhalt exakt inkl. Leerzeilen", () => {
    const src = "```\nline1\n\nline2\n```";
    expect(parseBlocks(src)).toEqual([{ kind: "codeblock", code: "line1\n\nline2" }]);
  });

  test("unbeendeter Code-Fence verliert keinen Inhalt", () => {
    const src = "```\nline1\nline2";
    expect(parseBlocks(src)).toEqual([{ kind: "codeblock", code: "line1\nline2" }]);
  });

  test("ungeordnete Liste (- und *)", () => {
    expect(parseBlocks("- a\n- b")).toEqual([
      { kind: "list", ordered: false, items: ["a", "b"] },
    ]);
    expect(parseBlocks("* a\n* b")).toEqual([
      { kind: "list", ordered: false, items: ["a", "b"] },
    ]);
  });

  test("geordnete Liste (1. 2. …)", () => {
    expect(parseBlocks("1. a\n2. b")).toEqual([
      { kind: "list", ordered: true, items: ["a", "b"] },
    ]);
  });

  test("Wechsel ordered/unordered beendet die Liste", () => {
    expect(parseBlocks("- a\n1. b")).toEqual([
      { kind: "list", ordered: false, items: ["a"] },
      { kind: "list", ordered: true, items: ["b"] },
    ]);
  });

  test("mehrzeiliger Absatz wird mit Leerzeichen verbunden", () => {
    expect(parseBlocks("Zeile eins\nZeile zwei")).toEqual([
      { kind: "paragraph", text: "Zeile eins Zeile zwei" },
    ]);
  });

  test("Leerzeilen trennen Absätze", () => {
    expect(parseBlocks("a\n\nb")).toEqual([
      { kind: "paragraph", text: "a" },
      { kind: "paragraph", text: "b" },
    ]);
  });
});

describe("parseInline", () => {
  test("bold **text**", () => {
    expect(parseInline("**bold**")).toEqual([
      { kind: "bold", children: [{ kind: "text", value: "bold" }] },
    ]);
  });

  test("italic *text* und _text_", () => {
    expect(parseInline("*i*")).toEqual([
      { kind: "italic", children: [{ kind: "text", value: "i" }] },
    ]);
    expect(parseInline("_i_")).toEqual([
      { kind: "italic", children: [{ kind: "text", value: "i" }] },
    ]);
  });

  test("snake_case_wort wird NICHT als Italic interpretiert (Wortgrenze)", () => {
    expect(parseInline("snake_case_wort")).toEqual([
      { kind: "text", value: "snake_case_wort" },
    ]);
  });

  test("inline code bleibt literal, wird nicht weiter geparst", () => {
    expect(parseInline("`**not bold**`")).toEqual([
      { kind: "code", value: "**not bold**" },
    ]);
  });

  test("Link mit Text und Href", () => {
    expect(parseInline("[Daybase](https://example.com)")).toEqual([
      { kind: "link", href: "https://example.com", text: "Daybase" },
    ]);
  });

  // Verschachtelung von Bold+Italic mit demselben Zeichen (*) ist mit dem
  // simplen Regex-Ansatz absichtlich nicht unterstützt (kein CommonMark-
  // Delimiter-Stack) — außerhalb der geforderten Teilmenge. Verschachtelung
  // mit anderen Inline-Elementen (Code) funktioniert und prüft, dass der
  // rekursive Aufruf den `lastIndex` der äußeren Schleife nicht verschiebt.
  test("Bold mit verschachteltem Inline-Code rekursiert korrekt ohne Index-Verschiebung", () => {
    expect(parseInline("**bold `code` end**")).toEqual([
      {
        kind: "bold",
        children: [
          { kind: "text", value: "bold " },
          { kind: "code", value: "code" },
          { kind: "text", value: " end" },
        ],
      },
    ]);
  });

  test("Text vor/nach/zwischen Matches bleibt erhalten", () => {
    expect(parseInline("a **b** c *d* e")).toEqual([
      { kind: "text", value: "a " },
      { kind: "bold", children: [{ kind: "text", value: "b" }] },
      { kind: "text", value: " c " },
      { kind: "italic", children: [{ kind: "text", value: "d" }] },
      { kind: "text", value: " e" },
    ]);
  });
});

describe("isSafeUrl", () => {
  test("erlaubt http/https/mailto", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("http://example.com")).toBe(true);
    expect(isSafeUrl("mailto:a@b.com")).toBe(true);
  });

  test("blockt javascript:/data: und sonstige Schemes", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
  });
});
