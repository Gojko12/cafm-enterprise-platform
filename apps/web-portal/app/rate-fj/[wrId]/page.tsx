"use client";

import React, { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useCafmStore } from "@/lib/cafm-store";
import { submitSurveyResponse } from "@/lib/fj-satisfaction";
import { formatDateTimeDDMMYYYY } from "@cafm/shared-schema";

export default function RateFjPage() {
  const params = useParams<{ wrId: string }>();
  const token = useSearchParams().get("token");
  const wrId = decodeURIComponent(params.wrId);
  const { data, setData } = useCafmStore();
  const wr = data.workRequests.find((item) => item.WR_ID === wrId && item.WR_Type === "FJ");
  const [satisfied, setSatisfied] = useState<boolean | null>(null);
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!wr) return <div className="mx-auto max-w-xl p-8">Fast Job {wrId} was not found.</div>;
  const survey = wr.Satisfaction;
  if (token && survey && survey.token !== token) return <div className="mx-auto max-w-xl p-8">This rating link is invalid or expired.</div>;
  if (survey?.status === "Answered" || done) {
    return <div className="mx-auto max-w-xl p-8 space-y-2"><h1 className="text-xl font-bold">Thank you for your feedback</h1><p className="text-sm text-slate-600">Your rating for {wr.WR_ID} has been recorded{survey?.feedbackAt ? ` on ${formatDateTimeDDMMYYYY(survey.feedbackAt)}` : ""}.</p></div>;
  }

  const submit = () => {
    if (satisfied === null) { setError("Please choose whether the service was OK."); return; }
    if (stars < 1) { setError("Please give a 1–5 star rating."); return; }
    if (!satisfied && !feedback.trim()) { setError("Please tell us what went wrong."); return; }
    setData((current) => submitSurveyResponse(current, wr.WR_ID, { satisfied, stars, feedback: feedback.trim() }));
    setDone(true);
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-2xl font-bold">How did we do?</h1>
      <div className="rounded border bg-slate-50 p-3 text-sm">
        <div className="font-semibold">{wr.WR_ID}</div>
        <div>{wr.Description}</div>
        <div className="text-xs text-slate-500">{wr.TradeName ?? ""} {wr.RoomCode ? `· Room ${wr.RoomCode}` : ""}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setSatisfied(true)} className={`rounded border p-3 text-sm font-medium ${satisfied === true ? "border-emerald-600 bg-emerald-100" : ""}`}>👍 Service OK (Satisfied)</button>
        <button type="button" onClick={() => setSatisfied(false)} className={`rounded border p-3 text-sm font-medium ${satisfied === false ? "border-red-600 bg-red-100" : ""}`}>👎 Service Not OK (Dissatisfied)</button>
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setStars(n)} className={`text-3xl ${n <= stars ? "text-amber-500" : "text-slate-300"}`}>★</button>)}
      </div>
      {satisfied === false && <textarea aria-label="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4} placeholder="What went wrong? A team leader will contact you directly." className="w-full rounded border p-2 text-sm" />}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="button" onClick={submit} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Submit rating</button>
    </div>
  );
}
