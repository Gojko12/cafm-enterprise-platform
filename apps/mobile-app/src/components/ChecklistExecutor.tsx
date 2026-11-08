import React, { useEffect, useState } from "react";
import { BaseWorkRequest } from "@cafm/shared-schema";

export interface PM_StepDefinition {
  StepId: string;
  StepNumber: number;
  StepTitle: string;
  Instruction?: string;
  InputType: "Boolean" | "Numeric" | "SingleSelect" | "MultiSelect" | "FreeText";
  IsRequired?: boolean;
  favourableBoolean?: boolean;
  MinThreshold?: number;
  MaxThreshold?: number;
  Unit?: string;
  RequiresPhotoOnFailure?: boolean;
  RequiresCommentOnFailure?: boolean;
  Options?: Array<{ OptionId: string; OptionValue: string; TriggersFailure?: boolean }>;
}

export interface PM_StepExecutionValue {
  StepId: string;
  Value: string | number | boolean | string[];
  PhotoUrl?: string;
  TechnicianComment?: string;
  Timestamp: string;
  Passed: boolean;
}

interface ChecklistExecutorProps {
  wr: BaseWorkRequest;
  steps: PM_StepDefinition[];
  onStepComplete?: (stepValues: PM_StepExecutionValue[]) => void | Promise<void>;
  onOpenFollowUpFJ?: () => void;
  onClose?: () => void;
}

export const ChecklistExecutor: React.FC<ChecklistExecutorProps> = ({
  wr,
  steps,
  onStepComplete,
  onOpenFollowUpFJ,
  onClose,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepValues, setStepValues] = useState<PM_StepExecutionValue[]>(() =>
    (wr.ChecklistResults ?? []).map((result) => {
      const step = steps.find((item) => item.StepId === result.stepId);
      const value = step?.InputType === "Boolean"
        ? result.value === "true"
        : result.value;
      return {
        StepId: result.stepId,
        Value: value,
        Timestamp: result.completedAt,
        Passed: result.passed,
        ...(result.photoPaths?.[0] ? { PhotoUrl: result.photoPaths[0] } : {}),
        ...(result.comment ? { TechnicianComment: result.comment } : {}),
      };
    }),
  );
  const [failurePhoto, setFailurePhoto] = useState<string | null>(null);
  const [failureComment, setFailureComment] = useState("");
  const [stepFailed, setStepFailed] = useState(false);

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  useEffect(() => {
    const saved = stepValues.find((item) => item.StepId === currentStep?.StepId);
    setFailurePhoto(saved?.PhotoUrl ?? null);
    setFailureComment(saved?.TechnicianComment ?? "");
    setStepFailed(saved ? !saved.Passed : false);
  }, [currentStep?.StepId, stepValues]);

  const handleBooleanInput = (value: boolean) => {
    const newValues = [...stepValues];
    const existingIndex = newValues.findIndex((v) => v.StepId === currentStep.StepId);
    const timestamp = new Date().toISOString();

    if (existingIndex >= 0) {
      newValues[existingIndex] = {
        ...newValues[existingIndex],
        Value: value,
        Timestamp: timestamp,
        Passed: value === (currentStep.favourableBoolean ?? true),
      };
    } else {
      newValues.push({
        StepId: currentStep.StepId,
        Value: value,
        Timestamp: timestamp,
        Passed: value === (currentStep.favourableBoolean ?? true),
      });
    }
    setStepValues(newValues);

    setStepFailed(value !== (currentStep.favourableBoolean ?? true));
  };

  const handleNumericInput = (value: string) => {
    const newValues = [...stepValues];
    const existingIndex = newValues.findIndex((v) => v.StepId === currentStep.StepId);
    const timestamp = new Date().toISOString();
    const numValue = Number(value);
    if (!value.trim() || !Number.isFinite(numValue)) {
      setStepValues(newValues.filter((item) => item.StepId !== currentStep.StepId));
      setStepFailed(false);
      return;
    }

    const isOutOfRange =
      (currentStep.MinThreshold !== undefined && numValue < currentStep.MinThreshold) ||
      (currentStep.MaxThreshold !== undefined && numValue > currentStep.MaxThreshold);

    if (existingIndex >= 0) {
      newValues[existingIndex] = {
        ...newValues[existingIndex],
        Value: numValue,
        Timestamp: timestamp,
        Passed: !isOutOfRange,
      };
    } else {
      newValues.push({
        StepId: currentStep.StepId,
        Value: numValue,
        Timestamp: timestamp,
        Passed: !isOutOfRange,
      });
    }
    setStepValues(newValues);

    if (isOutOfRange) {
      setStepFailed(true);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFailurePhoto(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTextInput = (value: string) => {
    const existing = stepValues.find((item) => item.StepId === currentStep.StepId);
    const next: PM_StepExecutionValue = {
      ...(existing ?? { StepId: currentStep.StepId, Passed: true }),
      Value: value,
      Timestamp: new Date().toISOString(),
    };
    setStepValues([...stepValues.filter((item) => item.StepId !== currentStep.StepId), next]);
  };

  const handleOptionInput = (optionValue: string, selected: boolean) => {
    const existing = stepValues.find((item) => item.StepId === currentStep.StepId);
    const currentValues = Array.isArray(existing?.Value) ? existing.Value : [];
    const nextValues = selected
      ? [...currentValues, optionValue]
      : currentValues.filter((value) => value !== optionValue);
    const failed = nextValues.some((value) =>
      currentStep.Options?.find((option) => option.OptionValue === value)?.TriggersFailure,
    );
    const next: PM_StepExecutionValue = {
      ...(existing ?? { StepId: currentStep.StepId, Passed: true }),
      Value: nextValues,
      Timestamp: new Date().toISOString(),
      Passed: !failed,
    };
    setStepValues([...stepValues.filter((item) => item.StepId !== currentStep.StepId), next]);
    setStepFailed(failed);
  };

  const handleNextStep = () => {
    if (stepFailed && currentStep.RequiresPhotoOnFailure !== false && !failurePhoto) {
      alert("Photo is required when a step fails");
      return;
    }
    if (stepFailed && currentStep.RequiresCommentOnFailure !== false && !failureComment.trim()) {
      alert("A comment is required when a step fails");
      return;
    }

    const currentValue = stepValues.find((item) => item.StepId === currentStep.StepId);
    if (currentValue) {
      setStepValues([...stepValues.filter((item) => item.StepId !== currentStep.StepId), {
        ...currentValue,
        ...(failurePhoto ? { PhotoUrl: failurePhoto } : {}),
        ...(failureComment.trim() ? { TechnicianComment: failureComment.trim() } : {}),
        Passed: !stepFailed,
      }]);
    }

    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      setStepFailed(false);
      setFailurePhoto(null);
      setFailureComment("");
    }
  };

  const handlePreviousStep = () => {
    if (currentStepIndex > 0) {
      const currentValue = stepValues.find((item) => item.StepId === currentStep.StepId);
      if (currentValue) {
        setStepValues([...stepValues.filter((item) => item.StepId !== currentStep.StepId), {
          ...currentValue,
          ...(failurePhoto ? { PhotoUrl: failurePhoto } : {}),
          ...(failureComment.trim() ? { TechnicianComment: failureComment.trim() } : {}),
          Passed: !stepFailed,
        }]);
      }
      setCurrentStepIndex(currentStepIndex - 1);
      setStepFailed(false);
      setFailurePhoto(null);
      setFailureComment("");
    }
  };

  const handleSubmitChecklist = async () => {
    if (stepFailed && currentStep.RequiresPhotoOnFailure !== false && !failurePhoto) {
      alert("Photo is required when a step fails");
      return;
    }

    if (stepFailed && currentStep.RequiresCommentOnFailure !== false && !failureComment.trim()) {
      alert("A comment is required when a step fails");
      return;
    }
    const currentValue = stepValues.find((item) => item.StepId === currentStep.StepId);
    const finalValues = stepValues.map((item) => item.StepId === currentStep.StepId
      ? { ...item, ...(failurePhoto ? { PhotoUrl: failurePhoto } : {}),
          ...(failureComment.trim() ? { TechnicianComment: failureComment.trim() } : {}) }
      : item);
    const answered = new Set(finalValues.filter((item) =>
      !(typeof item.Value === "string" && !item.Value.trim()) &&
      !(Array.isArray(item.Value) && item.Value.length === 0),
    ).map((item) => item.StepId));
    const missing = steps.filter((step) => step.IsRequired !== false && !answered.has(step.StepId));
    if (!currentValue && currentStep.IsRequired !== false) {
      alert(`Answer the current step before submitting: ${currentStep.StepTitle}`);
      return;
    }
    if (missing.length) {
      alert(`Complete the required answers for: ${missing.map((step) => step.StepTitle).join(", ")}`);
      return;
    }
    const checkedValues = finalValues.map((item) => item.StepId === currentStep.StepId
      ? { ...item, Passed: !stepFailed }
      : item);
    try {
      await onStepComplete?.(checkedValues);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save the completed checklist.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white mobile-checklist-executor">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-4 z-40">
        <h2 className="text-lg font-bold">{wr.Description}</h2>
        <p className="text-xs text-gray-600 mt-1">
          Step {currentStepIndex + 1} of {steps.length}
        </p>
        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-32">
        {/* Step Title */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="text-base font-bold text-gray-900">{currentStep.StepTitle}</h3>
          <p className="text-sm text-gray-700 mt-2">Step {currentStep.StepNumber}</p>
        </div>

        {/* Step Input */}
        <div className="space-y-3">
          {currentStep.InputType === "Boolean" && (
            <div className="flex gap-3">
              <button
                onClick={() => handleBooleanInput(true)}
                className="flex-1 px-4 py-4 bg-green-50 border-2 border-green-300 rounded-lg font-medium text-green-700 hover:bg-green-100 transition-colors"
              >
                ✓ Pass
              </button>
              <button
                onClick={() => handleBooleanInput(false)}
                className="flex-1 px-4 py-4 bg-red-50 border-2 border-red-300 rounded-lg font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                ✕ Fail
              </button>
            </div>
          )}

          {currentStep.InputType === "Numeric" && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Enter Value {currentStep.Unit ? `(${currentStep.Unit})` : ""}
              </label>
              <input
                type="number"
                placeholder="0"
                onChange={(e) => handleNumericInput(e.target.value)}
                className={`w-full px-4 py-3 border-2 rounded-lg text-lg font-mono text-center ${
                  stepFailed
                    ? "border-red-500 bg-red-50"
                    : "border-gray-300 hover:border-blue-400"
                }`}
                aria-label="Numeric input"
              />
              {currentStep.MinThreshold !== undefined && currentStep.MaxThreshold !== undefined && (
                <p className="text-xs text-gray-600 mt-2">
                  Valid range: {currentStep.MinThreshold} - {currentStep.MaxThreshold}{" "}
                  {currentStep.Unit}
                </p>
              )}
              {stepFailed && (
                <p className="text-xs text-red-600 mt-2">❌ Value out of acceptable range</p>
              )}
            </div>
          )}

          {currentStep.InputType === "SingleSelect" && currentStep.Options && (
            <div className="space-y-2">
              {currentStep.Options.map((opt) => (
                <button
                  key={opt.OptionId}
                  onClick={() => {
                    const failed = opt.TriggersFailure ?? false;
                    const next: PM_StepExecutionValue = {
                      StepId: currentStep.StepId,
                      Value: opt.OptionValue,
                      Timestamp: new Date().toISOString(),
                      Passed: !failed,
                    };
                    setStepValues([...stepValues.filter((item) => item.StepId !== currentStep.StepId), next]);
                    setStepFailed(failed);
                  }}
                  className="w-full px-4 py-3 text-left border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-sm"
                >
                  {opt.OptionValue}
                </button>
              ))}
            </div>
          )}

          {currentStep.InputType === "MultiSelect" && currentStep.Options && (
            <div className="space-y-2">
              {currentStep.Options.map((option) => (
                <label key={option.OptionId} className="flex items-center gap-2 rounded border p-3">
                  <input type="checkbox"
                    checked={Array.isArray(stepValues.find((item) => item.StepId === currentStep.StepId)?.Value) &&
                      (stepValues.find((item) => item.StepId === currentStep.StepId)?.Value as string[]).includes(option.OptionValue)}
                    onChange={(event) => handleOptionInput(option.OptionValue, event.target.checked)} />
                  {option.OptionValue}
                </label>
              ))}
            </div>
          )}

          {currentStep.InputType === "FreeText" && (
            <textarea
              placeholder="Enter observations..."
              rows={4}
              value={String(stepValues.find((item) => item.StepId === currentStep.StepId)?.Value ?? "")}
              onChange={(event) => handleTextInput(event.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm"
              aria-label="Free text input"
            />
          )}
        </div>

        {/* Failure Section */}
        {stepFailed && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 space-y-3">
            <h4 className="font-bold text-red-700">Step Failed - Evidence Required</h4>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Capture Photo
              </label>
              {failurePhoto || stepValues.find((item) => item.StepId === currentStep.StepId)?.PhotoUrl ? (
                <div className="relative">
                  <img
                    src={failurePhoto ?? stepValues.find((item) => item.StepId === currentStep.StepId)?.PhotoUrl}
                    alt="Failure photo"
                    className="w-full h-40 object-cover rounded"
                  />
                  <button
                    onClick={() => setFailurePhoto(null)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8"
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoCapture}
                    capture="environment"
                    className="hidden"
                    aria-label="Capture failure photo"
                  />
                  <div className="w-full px-4 py-6 border-2 border-dashed border-red-300 rounded-lg text-center cursor-pointer hover:border-red-500">
                    <p className="text-sm text-red-700">Tap to capture photo</p>
                  </div>
                </label>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Technician Comment
              </label>
              <textarea
                value={failureComment}
                onChange={(e) => setFailureComment(e.target.value)}
                placeholder="Explain the issue..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                aria-label="Failure comment"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={onOpenFollowUpFJ}
                className="flex-1 px-4 py-2 bg-green-500 text-white text-sm font-medium rounded hover:bg-green-600 transition-colors"
              >
                📋 Follow-Up FJ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation & Submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 space-y-2 mobile-checklist-nav">
        <div className="flex gap-2">
          <button
            onClick={handlePreviousStep}
            disabled={currentStepIndex === 0}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous step"
          >
            ← Back
          </button>

          {isLastStep ? (
            <button
              onClick={handleSubmitChecklist}
              className="flex-1 px-4 py-2 bg-green-500 text-white font-medium rounded hover:bg-green-600 transition-colors"
              aria-label="Submit checklist"
            >
              ✓ Submit
            </button>
          ) : (
            <button
              onClick={handleNextStep}
              className="flex-1 px-4 py-2 bg-blue-500 text-white font-medium rounded hover:bg-blue-600 transition-colors"
              aria-label="Next step"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
