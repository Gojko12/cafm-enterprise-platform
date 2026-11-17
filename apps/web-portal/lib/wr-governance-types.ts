export interface GovernanceProof {
  wrId: string;
  kind: "pm-reactivation" | "lj-override";
  reason: string;
  confirmed1At: string;
  confirmed2At: string;
}
