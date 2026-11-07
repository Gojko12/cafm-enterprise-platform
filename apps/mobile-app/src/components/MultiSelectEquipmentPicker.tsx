import React, { useState } from "react";
import { Equipment } from "@cafm/shared-schema";

interface MultiSelectEquipmentPickerProps {
  equipment: Equipment[];
  selectedCodes: Set<string>;
  onSelectionChange?: (codes: Set<string>) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const MultiSelectEquipmentPicker: React.FC<MultiSelectEquipmentPickerProps> = ({
  equipment,
  selectedCodes,
  onSelectionChange,
  onConfirm,
  onCancel,
}) => {
  const [searchText, setSearchText] = useState("");
  const [localSelection, setLocalSelection] = useState(new Set(selectedCodes));

  const filteredEquipment = equipment.filter((e) =>
    e.EquipmentName.toLowerCase().includes(searchText.toLowerCase()) ||
    e.EquipmentCode.toLowerCase().includes(searchText.toLowerCase()) ||
    (e.TradeName || "").toLowerCase().includes(searchText.toLowerCase())
  );

  const handleToggleEquipment = (code: string) => {
    const newSelection = new Set(localSelection);
    if (newSelection.has(code)) {
      newSelection.delete(code);
    } else {
      newSelection.add(code);
    }
    setLocalSelection(newSelection);
    if (onSelectionChange) {
      onSelectionChange(newSelection);
    }
  };

  const handleUnselectAll = () => {
    const newSelection = new Set<string>();
    setLocalSelection(newSelection);
    if (onSelectionChange) {
      onSelectionChange(newSelection);
    }
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end mobile-equipment-picker">
      <div className="w-full bg-white rounded-t-lg flex flex-col max-h-screen">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between">
          <h3 className="font-bold text-lg">Select Equipment</h3>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
            {localSelection.size} selected
          </span>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search equipment..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            aria-label="Search equipment"
          />
        </div>

        {/* Equipment List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filteredEquipment.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-500">
              No equipment found
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEquipment.map((eq) => (
                <button
                  key={eq.EquipmentCode}
                  onClick={() => handleToggleEquipment(eq.EquipmentCode)}
                  className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
                    localSelection.has(eq.EquipmentCode)
                      ? "bg-blue-50 border-blue-300"
                      : "bg-gray-50 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        localSelection.has(eq.EquipmentCode)
                          ? "bg-blue-500 border-blue-500"
                          : "border-gray-400"
                      }`}
                    >
                      {localSelection.has(eq.EquipmentCode) && (
                        <span className="text-white text-xs">✓</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {eq.EquipmentName}
                      </div>
                      <div className="text-xs text-gray-600">
                        {eq.EquipmentCode}
                        {eq.TradeName && ` · ${eq.TradeName}`}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-2">
          <button
            onClick={handleUnselectAll}
            className="flex-1 px-4 py-2 bg-orange-100 text-orange-700 text-sm font-medium rounded hover:bg-orange-200 transition-colors"
          >
            Unselect All
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-600 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
