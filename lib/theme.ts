"use client";

import { createElement } from "react";
import { z } from "zod";

export const THEME_STORAGE_KEY = "listwell-theme";

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d){r.classList.add("dark");r.style.colorScheme="dark";}else{r.style.colorScheme="light";}}catch(e){}})();`;

export const ThemeBootstrapScript = () =>
  createElement("script", {
    dangerouslySetInnerHTML: { __html: THEME_BOOTSTRAP_SCRIPT },
    suppressHydrationWarning: true,
    type: typeof window === "undefined" ? "text/javascript" : "text/plain",
  });

const themePreferenceSchema = z.enum(["light", "dark"]);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

const parseStoredTheme = (value: string | null): ThemePreference | null => {
  const parsed = themePreferenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const getStoredTheme = (): ThemePreference | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return parseStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
};

export const resolveTheme = (): ThemePreference => {
  const stored = getStoredTheme();
  if (stored) {
    return stored;
  }
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export const applyTheme = (theme: ThemePreference): void => {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
};

const THEME_CHANGE_EVENT = "listwell-theme-change";

export const subscribeTheme = (onStoreChange: () => void): (() => void) => {
  const onChange = () => onStoreChange();
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onChange);
  };
};

const setTheme = (theme: ThemePreference): void => {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
};

export const toggleTheme = (current: ThemePreference): ThemePreference => {
  const next: ThemePreference = current === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
};
