"use client";

import { createElement } from "react";

export const THEME_STORAGE_KEY = "listwell-theme";

/** Listwell is light mode only — strip any stored dark preference on boot. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var r=document.documentElement;r.classList.remove("dark");r.style.colorScheme="light";localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)},"light");}catch(e){}})();`;

export const ThemeBootstrapScript = () =>
  createElement("script", {
    dangerouslySetInnerHTML: { __html: THEME_BOOTSTRAP_SCRIPT },
    suppressHydrationWarning: true,
    type: typeof window === "undefined" ? "text/javascript" : "text/plain",
  });

export const applyTheme = (): void => {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.classList.remove("dark");
  root.style.colorScheme = "light";
};
