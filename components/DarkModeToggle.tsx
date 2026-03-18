"use client";

import { useState, useEffect } from "react";

export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check for user preference stored in cookie
    const pref = document.cookie
      .split("; ")
      .find((c) => c.startsWith("dark-mode="))
      ?.split("=")[1];

    if (pref === "true") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else if (pref === "false") {
      document.documentElement.classList.remove("dark");
    } else {
      // Follow system preference
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    // Store preference for 1 year
    document.cookie = `dark-mode=${next}; max-age=31536000; path=/; SameSite=Lax`;
  }

  return (
    <button onClick={toggle} className="text-lg leading-none" title="Toggle dark mode">
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
