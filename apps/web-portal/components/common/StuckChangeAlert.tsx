// V54 (Section 104): shown when a local change cannot be saved and retrying can never
// succeed (governance/permission rejection or an unresolvable merge conflict).
// Saving is paused until the user discards; discarding reverts this device to the
// last saved server state.
export function StuckChangeAlert({ message, onDiscard }: { message: string; onDiscard: () => void }) {
  return (
    <div role="alert" className="bg-orange-100 p-2 text-sm text-orange-900">
      <span className="font-semibold">Saving is paused: a local change cannot be saved to the server. {message}</span>
      <p className="mt-1">
        Nothing else from this browser will save until it is discarded. Discarding removes only this
        device&apos;s unsaved edits; everything already saved stays on the server.
      </p>
      <button type="button" onClick={onDiscard} className="mt-1 rounded bg-orange-700 px-2 py-1 font-semibold text-white hover:bg-orange-800">
        Discard local changes and reload server data
      </button>
    </div>
  );
}
