import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ClientLayout from "@/components/ClientLayout";
import AppShell from "@/components/AppShell";

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
        <ClientLayout>
          <AppShell>{children}</AppShell>
        </ClientLayout>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
