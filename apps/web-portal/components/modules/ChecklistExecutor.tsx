"use client";

import React, { useState } from "react";
import { X, Camera, CheckCircle2, XCircle, AlertCircle, Clock, ChevronDown } from "lucide-react";
import type { PM_ScheduleStep, PMStepInputType } from "@cafm/shared-schema";

interface ChecklistExecutorProps {
  isOpen: boolean;
  workRequestId: string;
  steps: PM_ScheduleStep[];
  onClose: () => void;
  onComplete?: (results: StepResult[]) => void;
}

interface StepResult {
  stepId: string;
  passed: boolean;
  value?: string | number | string[];
  photoPaths?: string[];
  comment?: string;
  completedAt: string;
}

interface TimerState {
  isRunning: boolean;
  seconds: number;
  overrideMinutes?: number;
}

export function ChecklistExecutor({
  isOpen,
  workRequestId,
  steps,
  onClose,
  onComplete,
}: ChecklistExecutorProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [results, setResults] = useState<StepResult[]>([]);
  const [timerState, setTimerState] = useState<TimerState>({
    isRunning: false,
    seconds: 0,
  });
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>();

  if (!isOpen) return null;

  const currentStep = steps[currentStepIndex];
  const currentResult = results.find((r) => r.stepId === currentStep.StepId);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const handleStepComplete = (passed: boolean, value?: any) => {
    const result: StepResult = {
      stepId: currentStep.StepId,
      passed,
      value,
      completedAt: new Date().toISOString(),
    };

    const existingIndex = results.findIndex(
      (r) => r.stepId === currentStep.StepId
    );
    if (existingIndex >= 0) {
      results[existingIndex] = result;
    } else {
      results.push(result);
    }

    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
        if (!currentResult) {
          handleStepComplete(false, "photo-taken");
        }
      };
      reader.readAsDataURL(file);
    }
    setShowPhotoPicker(false);
  };

  const toggleTimer = () => {
    setTimerState((prev) => ({
      ...prev,
      isRunning: !prev.isRunning,
    }));
  };

  const handleSkipStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleFinish = () => {
    // Validate mandatory steps
    const failedMandatory = steps.filter(
      (step) =>
        step.IsRequired &&
        !results.some((r) => r.stepId === step.StepId && r.passed)
    );

    if (failedMandatory.length > 0) {
      alert(
        `Please complete all mandatory steps. Missing: ${failedMandatory
          .map((s) => s.Title)
          .join(", ")}`
      );
      return;
    }

    onComplete?.(results);
    onClose();
  };

  const renderStepInput = () => {
    switch (currentStep.InputType) {
      case "Boolean":
        return (
          <div className="flex gap-4">
            <button
              onClick={() => handleStepComplete(true, "pass")}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-green-100 border-2 border-green-500 rounded-lg hover:bg-green-200 transition-colors text-green-900 font-semibold"
            >
              <CheckCircle2 size={24} />
              Pass / OK
            </button>
            <button
              onClick={() => handleStepComplete(false, "fail")}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-red-100 border-2 border-red-500 rounded-lg hover:bg-red-200 transition-colors text-red-900 font-semibold"
            >
              <XCircle size={24} />
              Fail / Issue
            </button>
          </div>
        );

      case "Numeric":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Value ({currentStep.Unit || "unit"}) *
              </label>
              <input
                type="number"
                placeholder="0.00"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const isOutOfRange =
                    (currentStep.MinThreshold !== undefined &&
                      val < currentStep.MinThreshold) ||
                    (currentStep.MaxThreshold !== undefined &&
                      val > currentStep.MaxThreshold);
                  if (isOutOfRange) {
                    handleStepComplete(false, val);
                  } else {
                    handleStepComplete(true, val);
                  }
                }}
              />
              {(currentStep.MinThreshold !== undefined ||
                currentStep.MaxThreshold !== undefined) && (
                <p className="text-xs text-gray-600 mt-2">
                  Expected range:{" "}
                  {currentStep.MinThreshold !== undefined
                    ? currentStep.MinThreshold
                    : "—"}{" "}
                  to{" "}
                  {currentStep.MaxThreshold !== undefined
                    ? currentStep.MaxThreshold
                    : "—"}
                </p>
              )}
            </div>
          </div>
        );

      case "SingleSelect":
      case "MultiSelect":
        return (
          <div className="space-y-2">
            {currentStep.Options.map((opt) => (
              <label
                key={opt.OptionId}
                className={`block p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  opt.TriggersFailure
                    ? "border-red-300 hover:bg-red-50"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type={
                      currentStep.InputType === "SingleSelect"
                        ? "radio"
                        : "checkbox"
                    }
                    name={currentStep.StepId}
                    value={opt.Value}
                    onChange={(e) =>
                      handleStepComplete(!opt.TriggersFailure, opt.Value)
                    }
                    className="w-5 h-5"
                  />
                  <span className="font-medium text-gray-900">
                    {opt.Label}
                  </span>
                  {opt.TriggersFailure && (
                    <AlertCircle size={18} className="text-red-600 ml-auto" />
                  )}
                </div>
              </label>
            ))}
          </div>
        );

      case "FreeText":
        return (
          <textarea
            placeholder="Enter observations, notes, or findings..."
            rows={4}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => handleStepComplete(true, e.target.value)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between border-b border-blue-800">
          <div>
            <h2 className="text-2xl font-bold">Execute Checklist</h2>
            <p className="text-blue-100 text-sm mt-1">{workRequestId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-blue-100 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">
              Step {currentStepIndex + 1} of {steps.length}
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {Math.round(progress)}%
            </p>
          </div>
          <div className="w-full bg-gray-300 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Timer Bar */}
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock size={20} className="text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">Work Session</p>
              <p className="text-lg font-bold text-blue-600">
                {Math.floor(timerState.seconds / 60)}:{String(timerState.seconds % 60).padStart(2, "0")} min
              </p>
            </div>
          </div>
          <button
            onClick={toggleTimer}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              timerState.isRunning
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            {timerState.isRunning ? "Pause" : "Start"}
          </button>
        </div>

        {/* Step Content */}
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {currentStep.Title}
            </h3>
            {currentStep.Instructions && (
              <p className="text-gray-600 mb-4">{currentStep.Instructions}</p>
            )}
          </div>

          {/* Step Input */}
          <div className="space-y-4">{renderStepInput()}</div>

          {/* Photo Capture for Failures */}
          {currentResult && !currentResult.passed && currentStep.RequiresPhotoOnFailure && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-orange-900">
                📸 Failure Photo Required
              </p>
              {!photoPreview ? (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-orange-300 rounded-lg p-4 cursor-pointer hover:bg-orange-100 transition-colors">
                  <Camera size={28} className="text-orange-600" />
                  <span className="text-sm font-medium text-orange-700">
                    Capture photo evidence
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />
                </label>
              ) : (
                <img
                  src={photoPreview}
                  alt="Evidence"
                  className="max-h-32 rounded-lg border border-orange-300"
                />
              )}
            </div>
          )}

          {/* Comment for Failures */}
          {currentResult && !currentResult.passed && currentStep.RequiresCommentOnFailure && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Failure Comment *
              </label>
              <textarea
                placeholder="Describe the issue and recommended corrective action..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                onChange={(e) => {
                  if (currentResult) {
                    currentResult.comment = e.target.value;
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 sticky bottom-0">
          <button
            onClick={handleSkipStep}
            disabled={currentStepIndex >= steps.length - 1}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Skip
          </button>
          <div className="flex gap-3">
            {currentStepIndex > 0 && (
              <button
                onClick={() => setCurrentStepIndex(currentStepIndex - 1)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                ← Back
              </button>
            )}
            {currentStepIndex < steps.length - 1 ? (
              <button
                onClick={() => setCurrentStepIndex(currentStepIndex + 1)}
                disabled={!currentResult}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Finish & Complete (78%)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
