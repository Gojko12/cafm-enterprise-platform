import { redirect } from "next/navigation";

export default function FreezesPage() {
  redirect("/scheduler?tab=freezes");
}
