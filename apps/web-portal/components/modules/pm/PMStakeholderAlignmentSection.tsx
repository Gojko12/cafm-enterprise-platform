import type React from "react";
import { PmCoordinationWorkspace } from "@/components/modules/PmCoordinationWorkspace";
import type { buildCoordinationItems } from "@/lib/pm-coordination";

interface Props {
  coordinationItem: ReturnType<typeof buildCoordinationItems>[number] | undefined;
  closureBox: React.ReactNode;
}

export function PMStakeholderAlignmentSection({ coordinationItem, closureBox }: Props) {
  return (
<section className="space-y-3 rounded border bg-slate-50 p-4" aria-label="Team Alignment and Notices">
            {coordinationItem ? <PmCoordinationWorkspace item={coordinationItem} /> : <p className="text-sm text-slate-600">No stakeholder teams or notices are tagged on this PM schedule. Tag them in SmartPM → Stakeholder Alignment &amp; Notices.</p>}
            {closureBox}
          </section>
  );
}
