export const WEEKDAYS = ["", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
export const WD_SHORT = ["", "Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

const pad = (n: number) => String(n).padStart(2, "0");
export const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

export function fmtTime(v?: string | Date | null) {
  if (!v) return "—";
  const d = toDate(v);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtDate(v?: string | Date | null, withYear = false) {
  if (!v) return "—";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00") : toDate(v);
  return `${d.getDate()}-${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
}
export function fmtDateTime(v?: string | Date | null) {
  if (!v) return "—";
  return `${fmtDate(v)}, ${fmtTime(v)}`;
}
export function isoDate(d: Date = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function isoWeekday(d: Date = new Date()) { return d.getDay() === 0 ? 7 : d.getDay(); }

export function relative(v?: string | Date | null) {
  if (!v) return "";
  const d = toDate(v);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 45) return "hozirgina";
  if (diff < 3600) return `${Math.round(diff / 60)} daqiqa oldin`;
  if (diff < 86400 && new Date().getDate() === d.getDate()) return `bugun ${fmtTime(d)}`;
  if (diff < 172800 && addDays(new Date(), -1).getDate() === d.getDate()) return `kecha ${fmtTime(d)}`;
  if (diff < 604800) return `${WEEKDAYS[isoWeekday(d)]}, ${fmtTime(d)}`;
  return fmtDateTime(d);
}

/** Muddatgacha qolgan vaqt: "2 kun", "5 soat", "muddati o'tgan" */
export function dueIn(v: string | Date) {
  const ms = toDate(v).getTime() - Date.now();
  if (ms < 0) {
    const h = Math.abs(ms) / 3600000;
    return { text: h < 24 ? `${Math.max(1, Math.round(h))} soat kechikdi` : `${Math.round(h / 24)} kun kechikdi`, tone: "red" as const, overdue: true };
  }
  const h = ms / 3600000;
  if (h < 1) return { text: `${Math.max(1, Math.round(ms / 60000))} daqiqa qoldi`, tone: "red" as const, overdue: false };
  if (h < 24) return { text: `${Math.round(h)} soat qoldi`, tone: "amber" as const, overdue: false };
  const days = Math.floor(h / 24);
  return { text: `${days} kun qoldi`, tone: days <= 2 ? ("amber" as const) : ("gray" as const), overdue: false };
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Xayrli tun";
  if (h < 11) return "Xayrli tong";
  if (h < 17) return "Xayrli kun";
  return "Xayrli kech";
}

export function fileSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function plural(n: number, word: string) { return `${n} ta ${word}`; }

export function toLocalInput(v?: string | Date | null) {
  if (!v) return "";
  const d = toDate(v);
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ROLE_LABEL: Record<string, string> = { director: "Direktor", admin: "Administrator", teacher: "O'qituvchi", student: "O'quvchi" };
