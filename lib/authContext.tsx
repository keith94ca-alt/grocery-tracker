"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  familyId: string | null;
  avatar: string | null;
  targetPrices: Record<string, number>;
  watchlist: number[];
  family: {
    id: string;
    name: string;
    adminId: string;
    inviteCode: string | null;
    inviteExpiresAt: string | null;
    members: { id: string; name: string; avatar: string | null; role: string }[];
  } | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        setUser(await res.json());
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Global 401 interceptor — catches session expiry on any fetch
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      if (res.status === 401) {
        const rawUrl = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].toString() : args[0] instanceof Request ? args[0].url : "";
        // Normalise to pathname only so both relative and absolute URLs are handled
        let urlPath = rawUrl;
        try { urlPath = new URL(rawUrl, window.location.origin).pathname; } catch { /* already a path */ }
        // Only redirect on our own protected API calls, not auth endpoints
        if (urlPath.startsWith("/api/") && !urlPath.startsWith("/api/auth/")) {
          setUser(null);
          window.location.href = "/login";
        }
      }
      return res;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
