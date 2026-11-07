import React, { useState, useRef } from "react";

interface QRScannerProps {
  onScanComplete?: (equipmentCode: string) => void;
  onCancel?: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScanComplete, onCancel }) => {
  const [scannedCode, setScannedCode] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // For MVP: simulate QR decoding with manual input
        // In production, would use jsQR or similar library
        setError("QR decoding requires additional library. Use manual input below.");
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleManualInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setScannedCode(value);
    setError("");
  };

  const handleScan = () => {
    if (!scannedCode.trim()) {
      setError("Please enter or scan an equipment code");
      return;
    }

    // Validate equipment code format (basic check)
    if (!/^[A-Z0-9]+$/.test(scannedCode)) {
      setError("Invalid equipment code format");
      return;
    }

    if (onScanComplete) {
      onScanComplete(scannedCode);
    }
    setScannedCode("");
  };

  return (
    <div className="flex flex-col h-full bg-white mobile-qr-scanner">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200">
        <h2 className="text-lg font-bold">QR Scanner</h2>
        <p className="text-xs text-gray-600 mt-1">Scan equipment QR or enter code manually</p>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6 space-y-4 overflow-y-auto">
        {/* Camera Input */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">
            Camera Scan (QR or Barcode)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            capture="environment"
            className="w-full px-3 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
            aria-label="Capture QR code image"
          />
          <p className="text-xs text-gray-500 mt-2">
            Open camera on your device or select an image
          </p>
        </div>

        {/* Manual Input */}
        <div className="border-t border-gray-200 pt-4">
          <label className="text-sm font-medium text-gray-700 block mb-2">
            Or Enter Code Manually
          </label>
          <input
            type="text"
            placeholder="e.g. EQP-2026-00001"
            value={scannedCode}
            onChange={handleManualInput}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-lg font-mono"
            aria-label="Enter equipment code manually"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-700 text-sm rounded">
            {error}
          </div>
        )}

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>Tip:</strong> Scan the QR code on the equipment tag. If unavailable, manually
            enter the equipment code printed on the label.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded hover:bg-gray-300 transition-colors"
          aria-label="Cancel scanning"
        >
          Cancel
        </button>
        <button
          onClick={handleScan}
          disabled={!scannedCode.trim()}
          className="flex-1 px-4 py-3 bg-green-500 text-white font-medium rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          aria-label="Process scanned code"
        >
          Process
        </button>
      </div>
    </div>
  );
};
