import { useEffect } from "react";

/**
 * Calls `callback` whenever the browser tab becomes visible again.
 * Use this to re-fetch data after the user navigates away (e.g. adds an item)
 * and then comes back — without a full page reload.
 */
export function useRefreshOnFocus(callback: () => void) {
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        callback();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [callback]);
}
