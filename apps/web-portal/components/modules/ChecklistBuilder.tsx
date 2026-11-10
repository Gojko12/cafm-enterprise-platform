"use client";

import React, { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { PM_ChecklistStandard, PM_ScheduleStep } from "@cafm/shared-schema";
import { CLASSICAL_TRADES, PM_ChecklistStandardSchema } from "@cafm/shared-schema";
import { PMSuppressionFields, suppressionConfig } from "../common/PMSuppressionFields";

interface ChecklistBuilderProps {
  onSave?: (checklist: PM_ChecklistStandard) => void;
  initialBlueprint?: PM_ChecklistStandard;
  inheritedSteps?: PM_ScheduleStep[];
  frequencyCode?: string;
}

export function ChecklistBuilder({ onSave, initialBlueprint, inheritedSteps = [], frequencyCode }: ChecklistBuilderProps) {
  const [code, setCode] = useState(initialBlueprint?.ChecklistCode || "");
  const [title, setTitle] = useState(initialBlueprint?.Title || "");
  const [maintenanceReason, setMaintenanceReason] = useState(initialBlueprint?.MaintenanceReason || "");
  const [trade, setTrade] = useState(initialBlueprint?.TradeId || "");
  const [expectedHours, setExpectedHours] = useState(initialBlueprint?.ExpectedHours || 0);
  const [steps, setSteps] = useState<PM_ScheduleStep[]>(initialBlueprint?.Steps || []);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [suppression, setSuppression] = useState(() => suppressionConfig(initialBlueprint));

  const handleAddStep = () => {
    const newStep: PM_ScheduleStep = {
      StepId: crypto.randomUUID(),
      Title: "",
      Instructions: "",
      SortOrder: steps.length + 1,
      InputType: "Boolean",
      favourableBoolean: true,
      Options: [],
      IsRequired: true,
      RequiresPhotoOnFailure: true,
      RequiresCommentOnFailure: true,
    };
    setSteps([...steps, newStep]);
    setExpandedStep(newStep.StepId);
  };

  const handleRemoveStep = (stepId: string) => {
    setSteps(steps.filter((s) => s.StepId !== stepId).map((step, index) => ({ ...step, SortOrder: index + 1 })));
  };

  const handleUpdateStep = (stepId: string, updates: Partial<PM_ScheduleStep>) => {
    setSteps(
      steps.map((s) => (s.StepId === stepId ? { ...s, ...updates } : s))
    );
  };

  const handleMoveStep = (stepId: string, direction: "up" | "down") => {
    const index = steps.findIndex((s) => s.StepId === stepId);
    if (
      (direction === "up" && index > 0) ||
      (direction === "down" && index < steps.length - 1)
    ) {
      const newSteps = [...steps];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      [newSteps[index], newSteps[targetIndex]] = [
        newSteps[targetIndex],
        newSteps[index],
      ];
      newSteps.forEach((s, i) => (s.SortOrder = i + 1));
      setSteps(newSteps);
    }
  };

  const handleSave = () => {
    if (!code || !title || !trade || steps.length === 0) {
      alert("Please fill in all required fields and add at least one step");
      return;
    }

    const checklist: PM_ChecklistStandard = {
      ...initialBlueprint,
      ...suppression,
      ChecklistCode: code,
      Title: title,
      MaintenanceReason: maintenanceReason,
      TradeId: trade,
      TradeName: trade,
      ExpectedHours: expectedHours,
      Steps: steps,
      IsActive: initialBlueprint?.IsActive ?? true,
      Version: initialBlueprint ? initialBlueprint.Version + 1 : 1,
      CreatedAt: initialBlueprint?.CreatedAt || new Date().toISOString(),
      UpdatedAt: new Date().toISOString(),
    };

    const result = PM_ChecklistStandardSchema.safeParse(checklist);
    if (!result.success) {
      alert(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
      return;
    }
    onSave?.(result.data);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PMSuppressionFields value={suppression} onChange={setSuppression} />
      {inheritedSteps.length > 0 && <details open className="rounded-xl border border-sky-300 bg-sky-50 p-4"><summary className="cursor-pointer font-semibold">Inherited from Lower Frequencies ({[...new Set(inheritedSteps.map((step) => step.originFrequency))].join(" / ")}) · read-only</summary>{inheritedSteps.map((step) => <p key={step.StepId} className="mt-2 text-sm"><span className="rounded bg-sky-100 px-2">{step.originFrequency}</span> {step.Title} {steps.some((item) => item.replacesStepId === step.StepId) && <strong className="text-amber-800"> · Replaced by higher frequency</strong>}</p>)}</details>}
      {/* Header Fields */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">{initialBlueprint ? "Edit" : "Create"} Checklist Blueprint</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Checklist Code *
            </label>
            <input
              type="text"
              value={code}
              disabled={Boolean(initialBlueprint)}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g., HVAC-MONTHLY-001"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Monthly HVAC Inspection"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Maintenance Reason
          </label>
          <input
            type="text"
            value={maintenanceReason}
            onChange={(e) => setMaintenanceReason(e.target.value)}
            placeholder="e.g., Routine system check to ensure optimal performance"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trade *
            </label>
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Trade...</option>
              {CLASSICAL_TRADES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expected Hours
            </label>
            <input
              type="number"
              value={expectedHours}
              onChange={(e) => setExpectedHours(parseFloat(e.target.value) || 0)}
              placeholder="0"
              step="0.5"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Steps Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">{frequencyCode ? `+${frequencyCode} Delta Steps Only` : "Checklist Steps"}</h3>
          <button
            onClick={handleAddStep}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Add Step
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.StepId}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Step Header */}
              <button
                onClick={() =>
                  setExpandedStep(
                    expandedStep === step.StepId ? null : step.StepId
                  )
                }
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 text-left">
                  <span className="text-sm font-semibold text-gray-600 bg-gray-200 px-2 py-1 rounded">
                    Step {index + 1}
                  </span>
                  <span className="font-medium text-gray-900">
                    {step.Title || "Untitled Step"}
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {step.InputType}
                  </span>
                </div>
                {expandedStep === step.StepId ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </button>

              {/* Step Details */}
              {expandedStep === step.StepId && (
                <div className="px-4 py-4 border-t border-gray-200 space-y-4 bg-white">
                  {inheritedSteps.length > 0 && <label className="block text-sm">Replaces lower-frequency step<select className="ml-2 rounded border p-2" value={step.replacesStepId ?? ""} onChange={(event) => {
                    const lower = inheritedSteps.find((item) => item.StepId === event.target.value);
                    handleUpdateStep(step.StepId, { replacesStepId: lower?.StepId, replacesStepLabel: lower ? `Replaces ${lower.originFrequency}: ${lower.Title}` : undefined });
                  }}><option value="">Additive (does not replace a step)</option>{inheritedSteps.map((lower) => <option key={lower.StepId} value={lower.StepId}>{lower.originFrequency}: {lower.Title}</option>)}</select></label>}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Step Title *
                    </label>
                    <input
                      type="text"
                      value={step.Title}
                      onChange={(e) =>
                        handleUpdateStep(step.StepId, { Title: e.target.value })
                      }
                      placeholder="e.g., Inspect air filter"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Instructions
                    </label>
                    <textarea
                      value={step.Instructions || ""}
                      onChange={(e) =>
                        handleUpdateStep(step.StepId, {
                          Instructions: e.target.value,
                        })
                      }
                      placeholder="Detailed instructions for completing this step..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Input Type *
                    </label>
                    <select
                      value={step.InputType}
                      onChange={(e) => {
                        const inputType = e.target.value as PM_ScheduleStep["InputType"];
                        const options = step.Options.length === 0 &&
                          (inputType === "SingleSelect" || inputType === "MultiSelect")
                          ? [1, 2].map((number) => ({
                              OptionId: crypto.randomUUID(),
                              Label: `Option ${number}`,
                              Value: crypto.randomUUID(),
                              SortOrder: number,
                              TriggersFailure: number === 2,
                            }))
                          : step.Options;
                        handleUpdateStep(step.StepId, { InputType: inputType, Options: options });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Boolean">Boolean (Pass/Fail)</option>
                      <option value="Numeric">Numeric (with thresholds)</option>
                      <option value="SingleSelect">Single Select</option>
                      <option value="MultiSelect">Multi-Select</option>
                      <option value="FreeText">Free Text</option>
                    </select>
                  </div>

                  {step.InputType === "Boolean" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Favourable Answer
                        <select
                          value={String(step.favourableBoolean ?? true)}
                          onChange={(e) => handleUpdateStep(step.StepId, { favourableBoolean: e.target.value === "true" })}
                          className="mt-1 w-full px-3 py-2 border rounded-lg"
                        >
                          <option value="true">&quot;Yes&quot; is Favourable (Default)</option>
                          <option value="false">&quot;No&quot; is Favourable</option>
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2 text-sm font-medium">
                        <span className="bg-green-100 text-green-800 rounded px-2 py-1">Favourable = Pass: {(step.favourableBoolean ?? true) ? "YES" : "NO"}</span>
                        <span className="bg-red-100 text-red-800 rounded px-2 py-1">Unfavourable = Fail: {(step.favourableBoolean ?? true) ? "NO" : "YES"}</span>
                      </div>
                    </div>
                  )}

                  {(step.InputType === "SingleSelect" || step.InputType === "MultiSelect") && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Select Options Builder</h4>
                      {step.Options.map((option) => (
                        <div key={option.OptionId} className="flex flex-wrap gap-2">
                          <input aria-label="Option label" value={option.Label} onChange={(e) =>
                            handleUpdateStep(step.StepId, { Options: step.Options.map((item) =>
                              item.OptionId === option.OptionId ? { ...item, Label: e.target.value } : item) })}
                            className="flex-1 min-w-[10rem] px-3 py-2 border rounded" />
                          <button type="button" onClick={() =>
                            handleUpdateStep(step.StepId, { Options: step.Options.map((item) =>
                              item.OptionId === option.OptionId ? { ...item, TriggersFailure: !item.TriggersFailure } : item) })}
                            className={`px-3 py-2 rounded text-sm ${option.TriggersFailure ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                            {option.TriggersFailure ? "Unfavourable (Fail)" : "Favourable (Pass)"}
                          </button>
                          <button type="button" aria-label={`Delete ${option.Label}`} onClick={() =>
                            handleUpdateStep(step.StepId, { Options: step.Options.filter((item) => item.OptionId !== option.OptionId) })}
                            className="px-3 py-2 bg-red-100 text-red-800 rounded">Delete</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => handleUpdateStep(step.StepId, {
                        Options: [...step.Options, { OptionId: crypto.randomUUID(), Label: `Option ${step.Options.length + 1}`,
                          Value: crypto.randomUUID(), SortOrder: step.Options.length + 1, TriggersFailure: false }],
                      })} className="px-3 py-2 bg-blue-100 text-blue-800 rounded">+ Add Option</button>
                    </div>
                  )}

                  {step.InputType === "Numeric" && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Unit
                        </label>
                        <input
                          type="text"
                          value={step.Unit || ""}
                          onChange={(e) =>
                            handleUpdateStep(step.StepId, { Unit: e.target.value })
                          }
                          placeholder="e.g., CFM, PSI"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Favourable Min Threshold
                        </label>
                        <input
                          type="number"
                          value={step.MinThreshold ?? ""}
                          onChange={(e) =>
                            handleUpdateStep(step.StepId, {
                              MinThreshold: e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Favourable Max Threshold
                        </label>
                        <input
                          type="number"
                          value={step.MaxThreshold ?? ""}
                          onChange={(e) =>
                            handleUpdateStep(step.StepId, {
                              MaxThreshold: e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={step.IsRequired}
                        onChange={(e) =>
                          handleUpdateStep(step.StepId, { IsRequired: e.target.checked })
                        }
                        className="rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Required Step
                      </span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={step.RequiresPhotoOnFailure}
                        onChange={(e) =>
                          handleUpdateStep(step.StepId, {
                            RequiresPhotoOnFailure: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Photo on Fail
                      </span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={step.RequiresCommentOnFailure}
                        onChange={(e) =>
                          handleUpdateStep(step.StepId, {
                            RequiresCommentOnFailure: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Comment on Fail
                      </span>
                    </label>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => handleMoveStep(step.StepId, "up")}
                      disabled={index === 0}
                      className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      ↑ Move Up
                    </button>
                    <button
                      onClick={() => handleMoveStep(step.StepId, "down")}
                      disabled={index === steps.length - 1}
                      className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      Move Down ↓
                    </button>
                    <button
                      onClick={() => handleRemoveStep(step.StepId)}
                      className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {steps.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No steps added yet. Click "Add Step" to begin.</p>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Save Blueprint
        </button>
      </div>
    </div>
  );
}
