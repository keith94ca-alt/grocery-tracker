"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/flyer", label: "Flyer", icon: "🏷️" },
  { href: "/add", label: "Add", icon: "➕" },
  { href: "/items", label: "Items", icon: "📦" },
  { href: "/list", label: "List", icon: "🛒" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg lg:hidden">
        <div className="max-w-2xl mx-auto flex">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? "text-brand-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <span className={`text-xl leading-none transition-transform duration-150 ${isActive ? "scale-110" : ""}`}>
                  {item.icon}
                </span>
                <span className={isActive ? "font-semibold" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop sidebar — hidden on mobile */}
      <nav className="hidden lg:flex fixed left-0 top-0 bottom-0 w-56 bg-white border-r border-gray-200 z-40 flex-col pt-16">
        <div className="px-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛒</span>
            <div>
              <p className="font-bold text-gray-900 text-sm">Grocery Tracker</p>
              <p className="text-xs text-gray-400">Price comparison</p>
            </div>
          </div>
        </div>
        <div className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-brand-50 text-brand-700 shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="p-4 border-t border-gray-100">
          <Link
            href="/history"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              pathname.startsWith("/history")
                ? "bg-brand-50 text-brand-700"
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            <span>📋</span>
            <span>Price History</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
