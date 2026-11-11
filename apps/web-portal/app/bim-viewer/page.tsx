"use client";

import { Suspense } from "react";
import { BIMViewer } from "@/components/modules/BIMViewer";

export default function BimViewerPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading the 3D BIM viewer…</div>}>
      <BIMViewer />
    </Suspense>
  );
}
