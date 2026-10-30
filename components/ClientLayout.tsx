"use client";

import React from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import OfflineScanSync from "@/components/OfflineScanSync";
import { ToastProvider } from "@/components/Toast";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <OfflineScanSync />
        {children}
      </ToastProvider>
    </ErrorBoundary>
  );
}
