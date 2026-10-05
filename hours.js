// hours: 7 entries (Mon..Sun), each a list of [startMin, endMin]; end may exceed 1440 past midnight. null = unknown.
const WARSAW = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY_IDX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function krakowNow() {
  const p = Object.fromEntries(WARSAW.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: DAY_IDX[p.weekday], min: +p.hour * 60 + +p.minute };
}

const hhmm = m => { m %= 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };

function is24(hours) { return hours && hours.every(d => d.some(([a, b]) => a === 0 && b >= 1440)); }

// { open: bool, until?: min, next?: {day, min} } or null when hours are unknown
function hoursStatus(hours, now = krakowNow()) {
  if (!hours) return null;
  if (is24(hours)) return { open: true, always: true };
  const prev = (now.day + 6) % 7;
  for (const [a, b] of hours[prev]) if (b > 1440 && now.min < b - 1440) return { open: true, until: b - 1440 };
  for (const [a, b] of hours[now.day]) if (now.min >= a && now.min < b) return { open: true, until: b };
  for (let i = 0; i < 7; i++) {
    const d = (now.day + i) % 7;
    const starts = hours[d].map(r => r[0]).filter(a => i > 0 || a > now.min).sort((x, y) => x - y);
    if (starts.length) return { open: false, next: { day: d, min: starts[0], today: i === 0 } };
  }
  return { open: false };
}

function dayText(ranges, closedLabel) {
  return ranges.length ? ranges.map(([a, b]) => `${hhmm(a)}–${hhmm(b)}`).join(", ") : closedLabel;
}
