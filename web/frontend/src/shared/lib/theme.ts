// Theme mode hook. Persists choice; applies via [data-theme] on <html>.
// "system" removes the attribute so the prefers-color-scheme media query rules.

import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "myfainance.theme";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
}

function readInitial(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readInitial);

  useEffect(() => {
    applyTheme(mode);
    if (mode === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, mode);
    }
  }, [mode]);

  const cycle = () => {
    setMode((m) => (m === "system" ? "light" : m === "light" ? "dark" : "system"));
  };

  return { mode, setMode, cycle };
}

// Apply the persisted theme as early as possible to avoid flash on load.
// Call once from main.tsx before React renders.
export function bootstrapTheme() {
  applyTheme(readInitial());
}
