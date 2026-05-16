
/** Convert "06:00" or "06:00:00" → "6:00 AM" */
export function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** Arrival time given departure and duration in minutes */
export function arrivalTime(dep: string, durationMins: number): string {
  const [h, m] = dep.split(":").map(Number);
  const total = h * 60 + m + durationMins;
  const ah = Math.floor(total / 60) % 24;
  const am = total % 60;
  return formatTime12h(`${String(ah).padStart(2,"0")}:${String(am).padStart(2,"0")}`);
}
