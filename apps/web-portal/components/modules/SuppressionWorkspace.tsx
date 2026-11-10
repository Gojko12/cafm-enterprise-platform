import type { SuppressedPmOccurrence } from "@cafm/shared-schema";

export function SuppressionLog({ entries, onOpen }: { entries: SuppressedPmOccurrence[]; onOpen?: (id: string) => void }) {
  return <div className="overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-100"><tr>{["Target", "Family", "Suppressed PMS #", "Frequency", "Target Date", "Covered By PMS # / WR #", "Reason"].map((text) => <th key={text} className="p-2">{text}</th>)}</tr></thead>
    <tbody>{entries.map((item) => <tr key={item.id} className="border-t"><td className="p-2">{item.targetKey ?? item.equipmentCode}</td><td>{item.suppressionGroupName}</td><td>{item.suppressedPmsId ?? "Legacy occurrence"}</td><td>{item.suppressedFrequency}</td><td>{item.dueDate}</td><td>PMS #{item.coveredByPmsId ?? "Legacy"} / {onOpen ? <button className="text-blue-700 underline" onClick={() => onOpen(item.coveredByWrId)}>WR #{item.coveredByWrId} →</button> : `WR #${item.coveredByWrId}`}</td><td>Covered by {item.coveredByFrequency}; scope inherited into the covering WR.</td></tr>)}</tbody>
  </table>{!entries.length && <p className="p-3 text-sm text-slate-500">No suppressed occurrences recorded.</p>}</div>;
}
