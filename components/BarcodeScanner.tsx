"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface BarcodeScannerProps {
  onScan: (upc: string) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onError, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualUpc, setManualUpc] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [waitingForPermission, setWaitingForPermission] = useState(true);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (codeReaderRef.current) {
      try { codeReaderRef.current.reset(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Start camera scanning
  const startScanning = useCallback(async () => {
    try {
      setWaitingForPermission(true);
      setCameraError(null);

      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;

      // Try to get rear camera first
      const devices = await codeReader.listVideoInputDevices();
      if (devices.length === 0) {
        setManualMode(true);
        setWaitingForPermission(false);
        return;
      }

      // Find rear camera (usually has "back" or "rear" in label, or last device)
      const rearCamera = devices.find(
        (d) => /back|rear|environment/i.test(d.label)
      ) || devices[devices.length - 1];

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: rearCamera.deviceId ? { exact: rearCamera.deviceId } : undefined,
          facingMode: "environment",
        },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setWaitingForPermission(false);
      setIsScanning(true);

      // Start decoding
      codeReader.decodeFromVideoDevice(
        rearCamera.deviceId,
        videoRef.current || undefined,
        (result, err) => {
          if (result) {
            const text = result.getText();
            // Validate: must be numeric and 12-13 digits (UPC-A or EAN-13)
            if (/^\d{12,13}$/.test(text)) {
              // Vibrate on success (if supported)
              if (navigator.vibrate) navigator.vibrate(100);
              cleanup();
              setIsScanning(false);
              onScan(text);
            }
          }
          // Errors during scanning are normal (no barcode in frame) — ignore them
        }
      ).catch(() => {
        setCameraError("Camera not available for scanning");
      });
    } catch (err: any) {
      setWaitingForPermission(false);
      setIsScanning(false);
      if (err.name === "NotAllowedError") {
        setCameraError("Camera access denied. Please enable camera permissions in your browser settings.");
      } else if (err.name === "NotFoundError") {
        setCameraError("No camera detected. You can enter the UPC manually below.");
        setManualMode(true);
      } else {
        setCameraError("Camera not available. Use manual entry below.");
        setManualMode(true);
      }
    }
  }, [cleanup, onScan]);

  // Handle manual UPC submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualUpc.trim();
    if (!/^\d{12,13}$/.test(trimmed)) {
      onError("UPC must be 12 or 13 digits");
      return;
    }
    onScan(trimmed);
  };

  useEffect(() => {
    startScanning();
    return () => cleanup();
  }, [startScanning, cleanup]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
        <h3 className="text-white font-semibold text-lg">📷 Scan Barcode</h3>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white text-2xl leading-none px-3 py-1"
        >
          ×
        </button>
      </div>

      {/* Camera View */}
      {!manualMode && (
        <div className="relative w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden bg-gray-900">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Scan Region Overlay */}
          {isScanning && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-64 h-32 border-2 border-white/60 rounded-lg">
                {/* Corner marks */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-32">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-brand-400" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-brand-400" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-brand-400" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-brand-400" />
                  {/* Center line animation */}
                  <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-brand-400/80 animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {/* Status Messages */}
          {waitingForPermission && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                <p className="text-4xl mb-3 animate-pulse">📷</p>
                <p className="text-sm">Tap &quot;Allow&quot; to enable barcode scanning</p>
              </div>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white p-6">
                <p className="text-4xl mb-3">⚠️</p>
                <p className="text-sm text-white/80">{cameraError}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Entry */}
      {manualMode && (
        <div className="w-full max-w-sm mt-16">
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <label className="block text-white/80 text-sm font-medium mb-1">
              Enter UPC (12 digits)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={manualUpc}
              onChange={(e) => setManualUpc(e.target.value.replace(/[^\d]/g, "").slice(0, 13))}
              placeholder="e.g., 062961660120"
              maxLength={13}
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-center text-lg tracking-widest placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              type="submit"
              disabled={manualUpc.length < 12}
              className="w-full py-3 bg-brand-600 text-white rounded-xl font-semibold disabled:opacity-40 hover:bg-brand-700 transition-colors"
            >
              Look Up Product
            </button>
          </form>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-6 left-0 right-0 text-center">
        {!manualMode && !cameraError && (
          <p className="text-white/50 text-xs">
            Point camera at a barcode
          </p>
        )}
        {!manualMode && (
          <button
            onClick={() => { cleanup(); setManualMode(true); }}
            className="text-brand-400 text-sm mt-2 underline hover:text-brand-300"
          >
            Enter UPC manually instead
          </button>
        )}
      </div>
    </div>
  );
}
