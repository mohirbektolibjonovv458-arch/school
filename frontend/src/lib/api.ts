// API mijoz: JWT (access + refresh), avtomatik yangilash, bir xil xato formati
const ACCESS = "sp-access";
const REFRESH = "sp-refresh";

export class ApiError extends Error {
  status: number;
  errors?: Record<string, unknown>;
  constructor(status: number, message: string, errors?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
  field(name: string): string | undefined {
    const v = this.errors?.[name];
    if (Array.isArray(v)) return String(v[0]);
    if (typeof v === "string") return v;
    return undefined;
  }
}

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* */ } },
};

export const tokens = {
  get access() { return store.get(ACCESS); },
  get refresh() { return store.get(REFRESH); },
  set(access: string | null, refresh?: string | null) {
    store.set(ACCESS, access);
    if (refresh !== undefined) store.set(REFRESH, refresh);
  },
  clear() { store.set(ACCESS, null); store.set(REFRESH, null); },
};

let onLogout: () => void = () => {};
export function setLogoutHandler(fn: () => void) { onLogout = fn; }

let refreshing: Promise<boolean> | null = null;
async function refreshAccess(): Promise<boolean> {
  const r = tokens.refresh;
  if (!r) return false;
  if (!refreshing) {
    refreshing = fetch("/api/auth/refresh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: r }) })
      .then(async (res) => {
        if (!res.ok) return false;
        const d = await res.json();
        tokens.set(d.access, d.refresh ?? r);
        return true;
      })
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  let data: any = null;
  try { data = await res.json(); } catch { /* */ }
  const msg = data?.detail || (res.status >= 500 ? "Serverda xato yuz berdi. Birozdan keyin urinib ko'ring." : `Xato (${res.status})`);
  return new ApiError(res.status, msg, data?.errors);
}

type Opts = { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal; raw?: boolean };

export async function api<T = any>(path: string, opts: Opts = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  const isForm = opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  const at = tokens.access;
  if (at) headers.Authorization = `Bearer ${at}`;
  let res: Response;
  try {
    res = await fetch(path.startsWith("/") ? path : `/api/${path}`, {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Internet aloqasi yo'q. Tarmoqni tekshirib qayta urinib ko'ring.");
  }
  if (res.status === 401 && retry && tokens.refresh) {
    if (await refreshAccess()) return api<T>(path, opts, false);
    tokens.clear();
    onLogout();
  }
  if (!res.ok) throw await parseError(res);
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Fayl yuklash progress bilan (sekin mobil internet uchun) */
export function upload<T = any>(path: string, form: FormData, onProgress?: (p: number) => void, method = "POST"): Promise<T> {
  const send = (): Promise<{ status: number; text: string }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, path.startsWith("/") ? path : `/api/${path}`);
      const at = tokens.access;
      if (at) xhr.setRequestHeader("Authorization", `Bearer ${at}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new ApiError(0, "Internet aloqasi uzildi. Qayta urinib ko'ring."));
      xhr.send(form);
    });
  return send().then(async (r) => {
    if (r.status === 401 && (await refreshAccess())) r = await send();
    let data: any = null;
    try { data = JSON.parse(r.text); } catch { /* */ }
    if (r.status >= 200 && r.status < 300) return data as T;
    if (r.status === 413) throw new ApiError(413, "Fayllar juda katta. Kamroq yoki kichikroq fayl yuboring.");
    throw new ApiError(r.status, data?.detail || `Xato (${r.status})`, data?.errors);
  });
}

export async function download(path: string, filename: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
