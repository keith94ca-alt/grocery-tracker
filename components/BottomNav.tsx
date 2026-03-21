"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home", short: "Home", icon: "🏠" },
  { href: "/flyer", label: "Flyers", short: "Flyers", icon: "🏷️" },
  { href: "/add", label: "Add Price", short: "Add", icon: "➕" },
  { href: "/items", label: "My Items", short: "Items", icon: "📦" },
  { href: "/list", label: "Shopping List", short: "List", icon: "🛒" },
];

const sideItems = [
  { href: "/stores", label: "Stores", icon: "🏪" },
  { href: "/compare", label: "Compare Stores", icon: "⚖️" },
  { href: "/history", label: "Price History", icon: "📋" },
  { href: "/family", label: "Family", icon: "👨‍👩‍👧" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg lg:hidden">
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
                <span className={isActive ? "font-semibold" : ""}>{item.short}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop sidebar — hidden on mobile */}
      <nav className="hidden lg:flex fixed left-0 top-0 bottom-0 w-56 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-40 flex-col pt-16">
        <div className="px-4 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛒</span>
            <div>
              <p className="font-bold text-gray-900 dark:text-white text-sm">Grocery Tracker</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Price comparison</p>
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
                    ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-1">
          {sideItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
