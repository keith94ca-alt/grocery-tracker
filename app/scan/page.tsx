"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";

export default function ScanPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(true);
  const [inputUpc, setInputUpc] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    found: boolean;
    source?: string;
    item?: any;
    error?: string;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      toast("Camera access denied", "error");
      setScanning(false);
    }
  }

  async function processUPC(code: string) {
    // Stop scanning
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);

    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upc: code }),
      });
      const data = await res.json();
      setResult(data);

      // If product exists in DB, navigate to it
      if (data.found && data.source === "database" && data.item?.id) {
        toast("Found existing item!", "success");
        setTimeout(() => router.push(`/item/${data.item.id}`), 1200);
        return;
      }

      // If found via Open Food Facts, offer to add
      if (data.found && data.source === "openfoodfacts") {
        toast("Product found on Open Food Facts", "success");
        return;
      }

      if (!data.found) {
        toast("Product not found — type UPC to add manually", "info");
      }
    } catch {
      toast("Failed to lookup UPC", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!scanning) return;
    if (!("BarcodeDetector" in window)) {
      toast("Barcode scanning not supported — type UPC below", "error");
      setScanning(false);
      return;
    }
    startCamera();

    const detector = new (window as any).BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
    });

    const scan = async () => {
      if (!videoRef.current || !streamRef.current || !scanning) return;
      try {
        if (videoRef.current.readyState >= 2) {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const raw = codes[0].rawValue;
            // Strip leading zero for UPC-A (13->12 digits)
            const cleaned = raw.length === 13 && raw.startsWith("0") ? raw.slice(1) : raw;
            // Accept 12 or 13 digit codes
            if (/^\d{12,13}$/.test(cleaned)) {
              setInputUpc(cleaned);
              processUPC(cleaned);
              return;
            }
          }
        }
      } catch {}
      scanLoopRef.current = requestAnimationFrame(scan);
    };
    scanLoopRef.current = requestAnimationFrame(scan);

    return () => {
      if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = inputUpc.trim();
    if (!/^\d{12,13}$/.test(cleaned)) {
      toast("UPC must be 12 or 13 digits", "error");
      return;
    }
    processUPC(cleaned);
  }

  function handleAddProduct() {
    if (!result?.item) return;
    const { name, brand, category, imageUrl, code } = result.item;
    const params = new URLSearchParams({
      name: name || "",
      brand: brand || "",
      category: category || "",
      imageUrl: imageUrl || "",
      upc: code || inputUpc,
      source: "scan",
    });
    router.push(`/add?${params.toString()}`);
  }

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <h2 className="text-2xl font-bold text-gray-900">Scan UPC</h2>
      </div>

      {/* Camera / Scanner */}
      {scanning && (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] max-h-[50vh] mx-auto">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-brand-400 rounded-2xl border-dashed animate-pulse" />
          </div>
          <p className="absolute bottom-4 left-0 right-0 text-center text-white text-sm">
            Point camera at barcode
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="text-4xl animate-pulse">⏳</div>
          <p className="mt-3 text-gray-500">Looking up product…</p>
        </div>
      )}

      {/* Manual UPC Input */}
      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputUpc}
          onChange={(e) => setInputUpc(e.target.value.replace(/[^\d]/g, "").slice(0, 13))}
          placeholder="Or type 12-13 digit UPC"
          inputMode="numeric"
          maxLength={13}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-3 bg-brand-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          Look up
        </button>
      </form>

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-5 ${result.found ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
          {result.found ? (
            <>
              <div className="flex items-start gap-4">
                {result.item?.imageUrl && (
                  <img
                    src={result.item.imageUrl}
                    alt={result.item.name}
                    className="w-16 h-16 rounded-xl object-cover bg-gray-100 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{result.item?.name}</p>
                  {result.item?.brand && <p className="text-sm text-gray-500">{result.item.brand}</p>}
                  {result.item?.category && <p className="text-xs text-gray-400 mt-0.5">{result.item.category}</p>}
                  {result.item?.upc && <p className="text-xs text-gray-400 font-mono mt-0.5">UPC: {result.item.upc}</p>}
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {result.source === "database" ? (
                  <Link
                    href={`/item/${result.item?.id}`}
                    className="flex-1 text-center py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold"
                  >
                    View Item →
                  </Link>
                ) : (
                  <button
                    onClick={handleAddProduct}
                    className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold"
                  >
                    + Add to Tracker
                  </button>
                )}
                {result.source !== "database" && (
                  <button
                    onClick={() => { setResult(null); setScanning(true); setInputUpc(""); startCamera(); }}
                    className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600"
                  >
                    Scan Another
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-center text-gray-600 font-medium">Product not found in database or Open Food Facts</p>
              <p className="text-center text-xs text-gray-400 mt-1">Add it manually with an UPC</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    const params = new URLSearchParams({ upc: inputUpc, source: "scan" });
                    router.push(`/add?${params.toString()}`);
                  }}
                  className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold"
                >
                  + Add Manually
                </button>
                <button
                  onClick={() => { setResult(null); setScanning(true); setInputUpc(""); startCamera(); }}
                  className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600"
                >
                  Scan Another
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
