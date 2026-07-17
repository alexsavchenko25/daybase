import { useSyncExternalStore } from "react";

export type Language = "de" | "en";

export const LANGUAGE_KEY = "daybase.language";
const LANGUAGE_EVENT = "daybase-language-change";

export function getLanguage(): Language {
  return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "de";
}

export function setLanguage(language: Language): void {
  localStorage.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
  window.dispatchEvent(new Event(LANGUAGE_EVENT));
}

export function applyStoredLanguage(): void {
  document.documentElement.lang = getLanguage();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LANGUAGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useI18n() {
  const language = useSyncExternalStore(subscribe, getLanguage, () => "de" as Language);
  return {
    language,
    locale: language === "de" ? "de-DE" : "en-US",
    tr: (de: string, en: string) => (language === "de" ? de : en),
    setLanguage,
  };
}
