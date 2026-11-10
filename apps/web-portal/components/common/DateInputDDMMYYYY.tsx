"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY, parseDateDDMMYYYY, parseDateTimeDDMMYYYY } from "@cafm/shared-schema";

type Props = {
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (isoDate: string) => void;
  className?: string;
  "aria-label"?: string;
  required?: boolean;
  disabled?: boolean;
};

export function DateInputDDMMYYYY({ value = "", onChange, onValueChange, className = "", required, disabled, ...ariaProps }: Props) {
  const [draft, setDraft] = useState(formatDateDDMMYYYY(value));
  const [error, setError] = useState("");
  const nativeInput = useRef<HTMLInputElement>(null);
  const emit = (isoDate: string) => {
    onValueChange?.(isoDate);
    onChange?.({ target: { value: isoDate }, currentTarget: { value: isoDate } } as ChangeEvent<HTMLInputElement>);
  };

  useEffect(() => {
    setDraft(formatDateDDMMYYYY(value));
    setError("");
  }, [value]);

  const commitDraft = () => {
    if (!draft.trim()) {
      setError(required ? "A date is required." : "");
      if (!required) emit("");
      return;
    }
    const isoDate = parseDateDDMMYYYY(draft);
    if (!isoDate) {
      setError("Enter a valid date as DD-MM-YYYY.");
      return;
    }
    setError("");
    setDraft(formatDateDDMMYYYY(isoDate));
    emit(isoDate);
  };

  const openCalendar = () => {
    if (disabled) return;
    const input = nativeInput.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  };

  return (
    <span className="relative inline-flex min-w-0 items-center">
      <input
        {...ariaProps}
        type="text"
        inputMode="numeric"
        placeholder="DD-MM-YYYY"
        autoComplete="off"
        value={draft}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${ariaProps["aria-label"] ?? "date"}-error` : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError("");
          const parsed = parseDateDDMMYYYY(event.target.value);
          if (parsed) emit(parsed);
          else if (!event.target.value) emit("");
        }}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
          }
        }}
        className={`min-w-0 rounded border px-2 py-1 pr-9 ${error ? "border-red-600" : ""} ${className}`}
      />
      <input
        ref={nativeInput}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setDraft(formatDateDDMMYYYY(event.target.value));
          setError("");
          emit(event.target.value);
        }}
        className="pointer-events-none absolute right-8 h-px w-px opacity-0"
      />
      <button type="button" className="absolute right-1 rounded px-1 text-slate-600 disabled:opacity-50" onClick={openCalendar} disabled={disabled} aria-label={`Open calendar${ariaProps["aria-label"] ? ` for ${ariaProps["aria-label"]}` : ""}`}>▦</button>
      {error && <span id={`${ariaProps["aria-label"] ?? "date"}-error`} role="alert" className="absolute left-0 top-full z-10 mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</span>}
    </span>
  );
}

type DateTimeProps = Omit<Props, "onValueChange"> & { onValueChange?: (isoDateTime: string) => void };

export function DateTimeInputDDMMYYYY({ value = "", onChange, onValueChange, className = "", required, disabled, ...ariaProps }: DateTimeProps) {
  const [draft, setDraft] = useState(formatDateTimeDDMMYYYY(value));
  const [error, setError] = useState("");
  const nativeInput = useRef<HTMLInputElement>(null);
  const emit = (isoDateTime: string) => {
    onValueChange?.(isoDateTime);
    onChange?.({ target: { value: isoDateTime }, currentTarget: { value: isoDateTime } } as ChangeEvent<HTMLInputElement>);
  };
  useEffect(() => {
    setDraft(formatDateTimeDDMMYYYY(value));
    setError("");
  }, [value]);
  const commitDraft = () => {
    if (!draft.trim()) {
      setError(required ? "A date and time is required." : "");
      if (!required) emit("");
      return;
    }
    const isoDateTime = parseDateTimeDDMMYYYY(draft);
    if (!isoDateTime) {
      setError("Enter a valid date and time as DD-MM-YYYY HH:mm.");
      return;
    }
    setError("");
    setDraft(formatDateTimeDDMMYYYY(isoDateTime));
    emit(isoDateTime);
  };
  const openCalendar = () => {
    if (disabled) return;
    const input = nativeInput.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  };
  return (
    <span className="relative inline-flex min-w-0 items-center">
      <input
        {...ariaProps}
        type="text"
        inputMode="numeric"
        placeholder="DD-MM-YYYY HH:mm"
        autoComplete="off"
        value={draft}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${ariaProps["aria-label"] ?? "date-time"}-error` : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError("");
          const parsed = parseDateTimeDDMMYYYY(event.target.value);
          if (parsed) emit(parsed);
          else if (!event.target.value) emit("");
        }}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
          }
        }}
        className={`min-w-0 rounded border px-2 py-1 pr-9 ${error ? "border-red-600" : ""} ${className}`}
      />
      <input
        ref={nativeInput}
        type="datetime-local"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setDraft(formatDateTimeDDMMYYYY(event.target.value));
          setError("");
          emit(event.target.value);
        }}
        className="pointer-events-none absolute right-8 h-px w-px opacity-0"
      />
      <button type="button" className="absolute right-1 rounded px-1 text-slate-600 disabled:opacity-50" onClick={openCalendar} disabled={disabled} aria-label={`Open calendar${ariaProps["aria-label"] ? ` for ${ariaProps["aria-label"]}` : ""}`}>▦</button>
      {error && <span id={`${ariaProps["aria-label"] ?? "date-time"}-error`} role="alert" className="absolute left-0 top-full z-10 mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</span>}
    </span>
  );
}
