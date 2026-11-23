"use client";

import React from "react";
import { EquipmentRegistry } from "@/components/modules/EquipmentRegistry";

export default function EquipmentPage() {
  return <React.Suspense fallback={null}><EquipmentRegistry /></React.Suspense>;
}
