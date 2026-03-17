"use client";

import React from "react";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  );
}
