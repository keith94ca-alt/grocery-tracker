import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "Grocery Price Tracker",
  description: "Track grocery prices and find the best deals",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Price Tracker",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div className="min-h-screen bg-gray-50 pb-20">
          <header className="bg-brand-600 text-white sticky top-0 z-40 shadow-md">
            <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
              <span className="text-2xl">🛒</span>
              <h1 className="text-lg font-bold tracking-tight">Grocery Price Tracker</h1>
            </div>
          </header>
          <main className="max-w-lg mx-auto">{children}</main>
        </div>
        <BottomNav />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
