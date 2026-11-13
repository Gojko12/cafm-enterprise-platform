"use client";

import React, { useState } from "react";
import type { DemoData } from "../../../lib/cafm-data";
import { DateTimeInputDDMMYYYY } from "../../common/DateInputDDMMYYYY";

type Person = DemoData["craftspeople"][number];

export function SchedulerAssignModal({ requestId, people, initialPerson = "", initialStart, initialEnd, onCancel, onSubmit }: {
  requestId: string;
  people: Person[];
  initialPerson?: string;
  initialStart: string;
  initialEnd: string;
  onCancel: () => void;
  onSubmit: (personId: string, start: string, end: string) => void;
}) {
  const [person, setPerson] = useState(initialPerson);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [error, setError] = useState("");

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="presentation">
    <form role="dialog" aria-modal="true" aria-label={`Schedule ${requestId}`} className="w-full max-w-md space-y-3 rounded-xl bg-white p-4 shadow-xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (end <= start) { setError("End time must be after start time."); return; }
        onSubmit(person, start, end);
      }}>
      <h2 className="font-semibold">Schedule {requestId}</h2>
      <label className="block text-sm">Craftsperson
        <select required className="mt-1 block w-full rounded border p-2" value={person} onChange={(event) => setPerson(event.target.value)}>
          <option value="">Select craftsperson</option>
          {people.map((item) => <option key={item.id} value={item.id}>{item.Name} {item.LastName} · {item.Trade}</option>)}
        </select>
      </label>
      <label className="block text-sm">Start
        <DateTimeInputDDMMYYYY required className="mt-1 block w-full rounded border p-2" aria-label="Assignment start date and time" value={start} onChange={(event) => setStart(event.target.value)} />
      </label>
      <label className="block text-sm">End
        <DateTimeInputDDMMYYYY required className="mt-1 block w-full rounded border p-2" aria-label="Assignment end date and time" value={end} onChange={(event) => setEnd(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="rounded border px-3 py-2" onClick={onCancel}>Cancel</button><button className="rounded bg-blue-700 px-3 py-2 font-semibold text-white">Assign</button></div>
    </form>
  </div>;
}
