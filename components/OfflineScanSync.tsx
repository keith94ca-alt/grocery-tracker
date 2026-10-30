"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import { getPendingQueue, resolveOfflineScan } from "@/lib/scan-offline";

export default function OfflineScanSync() {
  const { toast } = useToast();
  const syncingRef = useRef(false);

  useEffect(() => {
    async function syncPendingScans() {
      if (syncingRef.current || !navigator.onLine) return;

      const pending = getPendingQueue();
      if (pending.length === 0) return;

      syncingRef.current = true;
      let synced = 0;
      let unresolved = 0;

      try {
        for (const entry of pending) {
          try {
            const res = await fetch("/api/scan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ upc: entry.upc }),
            });
            const data = await res.json();

            if (res.ok && data?.found) {
              const persistRes = await fetch("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: data.item?.name || `Scanned UPC ${entry.upc}`,
                  category: data.item?.category || "Other",
                  unit: "each",
                  upc: entry.upc,
                  brand: data.item?.brand || null,
                  imageUrl: data.item?.imageUrl || null,
                }),
              });

              if (!persistRes.ok) {
                unresolved++;
                continue;
              }

              resolveOfflineScan(entry.upc, data);
              synced++;
            } else {
              unresolved++;
            }
          } catch {
            unresolved++;
          }
        }
      } finally {
        syncingRef.current = false;
      }

      if (synced > 0) {
        toast(`Synced ${synced} offline scan${synced === 1 ? "" : "s"}`, "success");
      }
      if (unresolved > 0) {
        toast(`${unresolved} offline scan${unresolved === 1 ? " is" : "s are"} still pending`, "info");
      }
    }

    syncPendingScans();
    window.addEventListener("online", syncPendingScans);
    return () => window.removeEventListener("online", syncPendingScans);
  }, [toast]);

  return null;
}
