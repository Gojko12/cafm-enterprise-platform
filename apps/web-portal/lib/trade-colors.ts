const colors: Record<string, string> = {
  Mechanical: "bg-blue-100 text-blue-800 border-blue-400",
  Electrical: "bg-amber-100 text-amber-800 border-amber-400",
  Civil: "bg-emerald-100 text-emerald-800 border-emerald-400",
  MultiTechnic: "bg-purple-100 text-purple-800 border-purple-400",
  Cleaning: "bg-cyan-100 text-cyan-800 border-cyan-400",
  HeavyGang: "bg-orange-100 text-orange-800 border-orange-400",
  Catering: "bg-rose-100 text-rose-800 border-rose-400",
};

export function tradeColor(trade?: string) {
  return colors[trade ?? ""] ?? "bg-slate-100 text-slate-800 border-slate-400";
}
