"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FAB() {
  const pathname = usePathname();

  // Don't show on add page or list page
  if (pathname === "/add" || pathname === "/list") return null;

  return (
    <Link
      href="/add"
      className="fixed bottom-24 right-4 z-50 w-14 h-14 bg-brand-600 dark:bg-brand-700 hover:bg-brand-700 dark:hover:bg-brand-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-all hover:scale-105 active:scale-95 lg:hidden"
      title="Add price"
    >
      +
    </Link>
  );
}
