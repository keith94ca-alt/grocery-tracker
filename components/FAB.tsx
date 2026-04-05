"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

export default function FAB() {
  const pathname = usePathname();

  // Don't show FAB on these pages
  if (pathname === "/add" || pathname === "/list" || pathname === "/scan") return null;

  return <FABButtons />;
}

function FABButtons() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside tap
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-3 lg:hidden" ref={ref}>
      {/* Mini actions */}
      <div className={`transition-all duration-200 flex flex-col items-end gap-2 ${
        open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}>
        {/* Scan button */}
        <div className="flex items-center gap-2">
          <span className="bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 text-xs font-medium px-2 py-1 rounded-lg">
            Scan
          </span>
          <Link
            href="/scan"
            className="w-12 h-12 bg-violet-600 dark:bg-violet-700 hover:bg-violet-700 dark:hover:bg-violet-600 text-white rounded-full shadow-lg flex items-center justify-center text-xl transition-all hover:scale-105 active:scale-95"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            title="Scan UPC"
          >
            📷
          </Link>
        </div>

        {/* Add button */}
        <div className="flex items-center gap-2">
          <span className="bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 text-xs font-medium px-2 py-1 rounded-lg">
            Add price
          </span>
          <Link
            href="/add"
            className="w-12 h-12 bg-brand-600 dark:bg-brand-700 hover:bg-brand-700 dark:hover:bg-brand-600 text-white rounded-full shadow-lg flex items-center justify-center text-xl transition-all hover:scale-105 active:scale-95"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            title="Add price"
          >
            +
          </Link>
        </div>
      </div>

      {/* Main FAB button */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all hover:scale-105 active:scale-95 ${
          open
            ? "bg-brand-700 dark:bg-brand-800 rotate-45"
            : "bg-brand-600 dark:bg-brand-700 hover:bg-brand-700 dark:hover:bg-brand-600"
        } text-white`}
        title="Quick actions"
      >
        {open ? "✕" : "+"}
      </button>
    </div>
  );
}
