import { redirect } from "next/navigation";

export default function PreventiveMaintenancePage() {
  redirect("/work-requests#PM");
}
