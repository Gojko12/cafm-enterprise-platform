import type React from "react";
import type { BaseWorkRequest, Equipment, PM_ChecklistStandard } from "@cafm/shared-schema";
import { formatDateDDMMYYYY } from "@cafm/shared-schema";
import { WRDetailsEditor } from "@/components/modules/WRDetailsEditor";

interface Props {
  workRequest: BaseWorkRequest;
  renderGroup: (title: string, left: React.ReactNode, right: React.ReactNode) => React.ReactNode;
  renderField: (label: string, value: string | number | boolean | undefined) => React.ReactNode;
  equipment: Equipment[];
  setInstallation: (equipmentCode: string, isInstallation: boolean) => void;
  blueprint: PM_ChecklistStandard | undefined;
}

export function PMDetailsPanel({ workRequest, renderGroup, renderField, equipment, setInstallation, blueprint }: Props) {
  return (
<div className="space-y-4">
            <WRDetailsEditor workRequest={workRequest} />
            {renderGroup("Work Request",
              <>
                {renderField("WR ID", workRequest.WR_ID)}
                {renderField("Work request status", workRequest.WorkRequestStatus)}
                {renderField("Start date (Date To Perform)", formatDateDDMMYYYY(workRequest.StartDate))}
                {renderField("Start date (TBD)", workRequest.StartDateTBD)}
                {renderField("created date", formatDateDDMMYYYY(workRequest.CreatedDate))}
              </>,
              <>
                {renderField("ESA Work Type", workRequest.ESAWorkType)}
                {renderField("Work request substatus", `${workRequest.Percentage}% ${workRequest.WorkRequestSubstatus}`)}
                {renderField("Due date", formatDateDDMMYYYY(workRequest.DueDate))}
                {renderField("Margin date", formatDateDDMMYYYY(workRequest.MarginDate))}
                {renderField("Trade name", workRequest.TradeName)}
                {renderField("Expected hours", workRequest.ExpectedHours)}
              </>,
            )}
            {renderGroup("Work Location",
              <>
                {renderField("Room code", workRequest.RoomCode)}
                {renderField("Level name", workRequest.LevelName)}
                {renderField("bl id", workRequest.bl_id)}
              </>,
              <>{renderField("Problem location", workRequest.ProblemLocation)}</>,
            )}
            {renderGroup("Equipment",
              <>
                {renderField("Equipment code", equipment.map((item) => item.EquipmentCode).join(", "))}
                {renderField("Local equipment code", equipment.map((item) => item.LocalEquipmentCode).filter(Boolean).join(", "))}
                {renderField("Equipment name", equipment.map((item) => item.EquipmentName).join(", "))}
                {renderField("Equipment Standard Description", equipment.map((item) => item.EquipmentStandardDescription).filter(Boolean).join(", "))}
                {renderField("Equipment standard ID", equipment.map((item) => item.EquipmentStandardId).filter(Boolean).join(", "))}
              </>,
              <div>
                <dt className="text-xs font-medium text-slate-500">Is installation</dt>
                {equipment.map((item) => <label key={item.EquipmentCode} className="mt-2 flex items-center gap-2 text-sm">
                  <span>{item.EquipmentCode}</span>
                  <select aria-label={`Is installation ${item.EquipmentCode}`} value={String(item.IsInstallation)}
                    onChange={(event) => setInstallation(item.EquipmentCode, event.target.value === "true")}
                    className="rounded border px-2 py-1">
                    <option value="true">Yes</option><option value="false">No</option>
                  </select>
                </label>)}
                {!equipment.length && <dd className="mt-1 text-sm">—</dd>}
              </div>,
            )}
            {renderGroup("Preventive Maintenance Procedure Details",
              <>
                {renderField("PMP ID Original", workRequest.PMPIdOriginal)}
                {renderField("PMP ID Smart", workRequest.PMPIdSmart)}
                {renderField("PM Procedure Description", workRequest.PMProcedureDescription ?? blueprint?.MaintenanceReason)}
                {renderField("PM Procedure Description SMART", workRequest.PMProcedureDescriptionSmart ?? blueprint?.Title)}
                {renderField("Responsible company", workRequest.ResponsibleCompany)}
                {renderField("Responsible person", workRequest.ResponsiblePerson)}
              </>,
              <>
                {renderField("PMS ID Original", workRequest.PMSIdOriginal)}
                {renderField("PMS ID Smart", workRequest.PMSIdSmart)}
              </>,
            )}
          </div>
  );
}
