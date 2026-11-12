import { redirect } from "next/navigation";

export default function SiteRoleAssignmentsRedirect() {
  redirect("/admin/rbac?tab=fm-roles");
}
