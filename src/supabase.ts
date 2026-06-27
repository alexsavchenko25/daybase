// Supabase Cloud Sync — Vorbereitung. NICHT aktiv: solange keine Daten
// migriert werden, bleibt IndexedDB (src/db.ts) die alleinige Quelle.
//
// Kapselung: dies ist die EINZIGE Stelle, die `createClient` aufruft und die
// VITE_SUPABASE_*-Env-Variablen liest. Alles andere importiert von hier.
//
// Ohne konfigurierte Env-Variablen ist `supabase` = null und
// `isSupabaseConfigured` = false → App läuft unverändert rein lokal weiter.
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Singleton-Client (oder null, falls nicht konfiguriert). Persistiert die
// Session im localStorage, damit ein Login einen Reload überlebt.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "daybase.supabase.auth",
      },
    })
  : null;

// Login-Status, technisch vorbereitet. Liefert die aktuelle Session (oder
// null) und ein Loading-Flag. Reagiert live auf Login/Logout.
// Noch ohne UI — Module können das später konsumieren.
export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
