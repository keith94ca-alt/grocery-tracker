/**
 * Offline UPC scan queue.
 *
 * When user scans a UPC while offline, we store it in localStorage.
 * When connectivity is restored, we resolve the items and update the DB.
 */

const PENDING_KEY = "scanned-upcs-pending";
const RESOLVED_KEY = "scanned-upcs-resolved";
export const SCAN_QUEUE_UPDATED_EVENT = "scan-queue-updated";

export interface OfflineScan {
  upc: string;
  timestamp: number; // ms since epoch
}

export interface ResolvedScan {
  upc: string;
  name: string;
  brand: string | null;
  category: string;
  imageUrl?: string | null;
  timestamp: number;
  resolvedAt?: number;
  pending?: boolean;
}

function notifyScanQueueUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SCAN_QUEUE_UPDATED_EVENT));
  }
}

function saveResolvedQueue(resolved: ResolvedScan[]) {
  localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolved.slice(-50)));
  notifyScanQueueUpdated();
}

export function upsertResolvedPlaceholder(upc: string, timestamp = Date.now()) {
  try {
    const resolved = getResolvedQueue();
    const existingIndex = resolved.findIndex((entry) => entry.upc === upc);
    const placeholder: ResolvedScan = {
      upc,
      name: `Scanned UPC ${upc}`,
      brand: null,
      category: "Other",
      imageUrl: null,
      timestamp,
      pending: true,
    };

    if (existingIndex >= 0) {
      resolved[existingIndex] = {
        ...resolved[existingIndex],
        ...placeholder,
        timestamp: resolved[existingIndex].timestamp || timestamp,
      };
    } else {
      resolved.push(placeholder);
    }

    saveResolvedQueue(resolved);
  } catch {
    // localStorage unavailable — silently fail
  }
}

/** Add a UPC to the offline pending queue */
export function queueOfflineScan(upc: string) {
  try {
    const queue = getPendingQueue();
    const existing = queue.find((entry) => entry.upc === upc);
    if (existing) return;
    const timestamp = Date.now();
    queue.push({ upc, timestamp });
    localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
    notifyScanQueueUpdated();
    upsertResolvedPlaceholder(upc, timestamp);
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/** Get the current pending queue */
export function getPendingQueue(): OfflineScan[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getPendingScan(upc: string): OfflineScan | null {
  return getPendingQueue().find((entry) => entry.upc === upc) || null;
}

export function removePendingScan(upc: string) {
  try {
    const pending = getPendingQueue().filter((entry) => entry.upc !== upc);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    notifyScanQueueUpdated();
  } catch {
    // localStorage unavailable — silently fail
  }
}

/** Get resolved scan history (limited to last 50) */
export function getResolvedQueue(): ResolvedScan[] {
  try {
    const raw = localStorage.getItem(RESOLVED_KEY);
    const all: ResolvedScan[] = raw ? JSON.parse(raw) : [];
    return all.slice(-50);
  } catch {
    return [];
  }
}

/** Resolve a queued UPC (called when online and scan lookup succeeds) */
export function resolveOfflineScan(upc: string, result: any) {
  try {
    const queued = getPendingScan(upc);
    removePendingScan(upc);

    const resolved = getResolvedQueue();
    const existingIndex = resolved.findIndex((entry) => entry.upc === upc);
    const enriched: ResolvedScan = {
      upc,
      name: result.item?.name || upc,
      brand: result.item?.brand || null,
      category: result.item?.category || "Other",
      imageUrl: result.item?.imageUrl || null,
      timestamp: queued?.timestamp || Date.now(),
      resolvedAt: Date.now(),
      pending: false,
    };

    if (existingIndex >= 0) {
      resolved[existingIndex] = {
        ...resolved[existingIndex],
        ...enriched,
        timestamp: resolved[existingIndex].timestamp || enriched.timestamp,
      };
    } else {
      resolved.push(enriched);
    }

    saveResolvedQueue(resolved);
  } catch {
    // fail silently
  }
}

/** Check if this UPC is in the pending queue */
export function isPendingScan(upc: string): boolean {
  return getPendingQueue().some((s) => s.upc === upc);
}

/** Clear all pending and resolved queues */
export function clearScanQueues() {
  localStorage.removeItem(PENDING_KEY);
  localStorage.removeItem(RESOLVED_KEY);
  notifyScanQueueUpdated();
}
