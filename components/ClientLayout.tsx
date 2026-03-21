"use client";

import React from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/lib/authContext";
import AuthGuard from "@/components/AuthGuard";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
