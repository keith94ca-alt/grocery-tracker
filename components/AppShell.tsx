"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import FAB from "@/components/FAB";
import DarkModeToggle from "@/components/DarkModeToggle";
import UserMenu from "@/components/UserMenu";

const PUBLIC_PATHS = ["/login", "/register"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // No chrome — just render the page content full-screen
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      <header className="bg-brand-600 dark:bg-brand-800 text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-2xl lg:max-w-none mx-auto lg:ml-56 px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛒</span>
            <h1 className="text-lg font-bold tracking-tight">Grocery Price Tracker</h1>
          </div>
          <div className="flex items-center gap-2">
            <DarkModeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="max-w-2xl lg:max-w-none mx-auto px-1 lg:px-6 lg:ml-56">
        {children}
      </main>
      <BottomNav />
      <FAB />
    </div>
  );
}
