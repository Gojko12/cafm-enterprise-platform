import type { BaseWorkRequest } from "@cafm/shared-schema";

export function canCloseWorkRequestAt100(wr: BaseWorkRequest): boolean {
  return wr.Percentage === 78;
}

export function hundredPercentTransitionError(wr: BaseWorkRequest): string | null {
  return canCloseWorkRequestAt100(wr)
    ? null
    : `${wr.WR_ID}: completion at 100% is only available after Technically Completed (78%).`;
}

export function assertCanCloseWorkRequestAt100(wr: BaseWorkRequest): void {
  const error = hundredPercentTransitionError(wr);
  if (error) throw new Error(error);
}
