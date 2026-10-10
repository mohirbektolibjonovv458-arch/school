import { ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Atom, BookOpen, Calculator, Check, CheckCircle2, ChevronLeft, Clock, Code2, Download, Dumbbell, FileText, FlaskConical,
  Globe2, Image as ImageIcon, Inbox, Landmark, Languages, Leaf, Loader2, Music, Palette, PenTool, RefreshCw, RotateCcw, Search, Upload, X, XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { fileSize } from "../lib/format";
import type { FileInfo, HwState } from "../lib/types";

/* ---------- Tugma ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "soft" | "ghost" | "danger" | "danger-soft" | "success";
  size?: "sm" | "md" | "lg"; block?: boolean; loading?: boolean; icon?: ReactNode;
};
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", block, loading, icon, children, className = "", disabled, type = "button", ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={`btn btn-${variant} ${size !== "md" ? `btn-${size}` : ""} ${block ? "btn-block" : ""} ${className}`}
      disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, badge, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; badge?: number }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      {children}
      {badge ? <span className="count-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}

export function BackButton({ to }: { to?: string }) {
  const nav = useNavigate();
  return (
    <IconButton label="Orqaga" className="icon-btn back" onClick={() => (to ? nav(to) : window.history.length > 1 ? nav(-1) : nav("/"))}>
      <ChevronLeft />
    </IconButton>
  );
}

/* ---------- Forma ---------- */
export function Field({ label, error, help, children, className = "" }: { label?: ReactNode; error?: string; help?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {error ? <div className="error">{error}</div> : help ? <div className="help">{help}</div> : null}
    </div>
  );
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ invalid, className = "", ...p }, ref) {
  return <input ref={ref} className={`input ${invalid ? "invalid" : ""} ${className}`} {...p} />;
});
export function Select({ invalid, className = "", children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select className={`select ${invalid ? "invalid" : ""} ${className}`} {...p}>{children}</select>;
}
export function Textarea({ invalid, className = "", ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`textarea ${invalid ? "invalid" : ""} ${className}`} {...p} />;
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}
export function SearchInput({ value, onChange, placeholder = "Qidirish…", autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="input-icon">
      <Search />
      <input className="input" type="search" inputMode="search" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} enterKeyHint="search" />
      {value && <span className="clear"><IconButton label="Tozalash" onClick={() => onChange("")}><X /></IconButton></span>}
    </div>
  );
}

/* ---------- Ko'rinish ---------- */
export function Card({ children, className = "", title, action, onClick }: { children?: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; onClick?: () => void }) {
  return (
    <div className={`card ${onClick ? "hover" : ""} ${className}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}>
      {(title || action) && <div className="card-title"><h3>{title}</h3>{action}</div>}
      {children}
    </div>
  );
}
export function Badge({ tone = "gray", children, icon }: { tone?: string; children: ReactNode; icon?: ReactNode }) {
  return <span className={`badge ${tone}`}>{icon}{children}</span>;
}
export function SectionTitle({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return <div className="section-title"><h2>{title}</h2>{action}</div>;
}

const AVATAR_COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#F43F5E", "#F97316", "#EAB308", "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6"];
export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const parts = (name || "?").trim().split(/\s+/);
  const initials = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
  let h = 0;
  for (const ch of name || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: url && !broken ? "var(--surface-2)" : bg }}>
      {url && !broken ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials}
    </div>
  );
}

const SUBJECT_ICONS: Record<string, typeof BookOpen> = {
  book: BookOpen, calculator: Calculator, flask: FlaskConical, globe: Globe2, languages: Languages, music: Music, palette: Palette,
  dumbbell: Dumbbell, code: Code2, atom: Atom, landmark: Landmark, leaf: Leaf, pen: PenTool,
};
export const SUBJECT_ICON_NAMES = Object.keys(SUBJECT_ICONS);
export function SubjectIcon({ icon, color, size = 44 }: { icon?: string; color: string; size?: number }) {
  const I = SUBJECT_ICONS[icon || "book"] || BookOpen;
  return (
    <div className="subject-icon" style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
      <I style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

/* ---------- Holatlar ---------- */
export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon || <Inbox />}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: ApiError | Error | null; onRetry?: () => void }) {
  const offline = (error as ApiError)?.status === 0;
  return (
    <div className="empty">
      <div className="empty-icon" style={{ background: "var(--red-soft)", color: "var(--red)" }}><AlertTriangle /></div>
      <h3>{offline ? "Internet aloqasi yo'q" : (error as ApiError)?.status === 403 ? "Ruxsat yo'q" : "Ma'lumotni yuklab bo'lmadi"}</h3>
      <p>{error?.message}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={onRetry} className="mt-8">Qayta urinish</Button>}
    </div>
  );
}
export function Skeleton({ h = 16, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}
export function ListSkeleton({ rows = 5, card = true }: { rows?: number; card?: boolean }) {
  const inner = Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="list-item">
      <Skeleton h={42} w={42} r={13} />
      <div className="grow col gap-8"><Skeleton h={14} w="60%" /><Skeleton h={12} w="35%" /></div>
    </div>
  ));
  return card ? <div className="card pad-0">{inner}</div> : <>{inner}</>;
}
export function PageSkeleton() {
  return (
    <div className="stack">
      <Skeleton h={120} r={24} />
      <div className="grid-2"><Skeleton h={88} r={18} /><Skeleton h={88} r={18} /></div>
      <ListSkeleton rows={4} />
    </div>
  );
}
/** Yuklanish / xato / bo'sh holatlarni bir joyda boshqaradi */
export function Loader<T>({ state, children, skeleton, empty }: {
  state: { data: T | null; error: any; loading: boolean; reload: () => void };
  children: (d: T) => ReactNode; skeleton?: ReactNode; empty?: (d: T) => ReactNode | null;
}) {
  if (state.loading && state.data === null) return <>{skeleton ?? <PageSkeleton />}</>;
  if (state.error && state.data === null) return <ErrorState error={state.error} onRetry={() => state.reload()} />;
  if (state.data === null) return null;
  const e = empty?.(state.data);
  if (e) return <>{e}</>;
  return <>{children(state.data)}</>;
}

export function Alert({ tone = "info", children, icon }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode; icon?: ReactNode }) {
  const I = tone === "success" ? CheckCircle2 : tone === "error" ? XCircle : tone === "warn" ? AlertTriangle : Clock;
  return <div className={`alert ${tone}`}>{icon || <I />}<div className="alert-body">{children}</div></div>;
}

/* ---------- Pastki varaq (mobil) / dialog (desktop) ---------- */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <IconButton label="Yopish" onClick={onClose}><X /></IconButton>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; text?: string; danger?: boolean; ok?: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (title: string, opts: { text?: string; danger?: boolean; ok?: string } = {}) =>
    new Promise<boolean>((resolve) => setState({ title, ...opts, resolve }));
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const el = (
    <Sheet open={!!state} onClose={() => close(false)} title={state?.title || ""}
      footer={<><Button variant="secondary" onClick={() => close(false)}>Bekor qilish</Button>
        <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>{state?.ok || "Tasdiqlash"}</Button></>}>
      {state?.text && <p className="muted">{state.text}</p>}
    </Sheet>
  );
  return { confirm, el };
}

/* ---------- Segment ---------- */
export function Segment<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="segment" role="tablist">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} className={value === i.value ? "active" : ""} onClick={() => onChange(i.value)}>
          {i.label}{i.count !== undefined && i.count > 0 && <span className="count">{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Statistika ---------- */
export function Stat({ label, value, hint, icon, tone = "primary", onClick }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: string; onClick?: () => void }) {
  return (
    <div className={`stat ${onClick ? "card hover" : ""}`} onClick={onClick} style={onClick ? { padding: 14 } : undefined}>
      <div className="label">{icon && <span className={`stat-icon tone-${tone}`}>{icon}</span>}<span className="ellipsis">{label}</span></div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
export function Ring({ value, size = 64, stroke = 7, color = "var(--primary)", label }: { value: number | null; size?: number; stroke?: number; color?: string; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} />
      </svg>
      <div className="ring-label">{label ?? <b className="num">{value === null ? "—" : `${Math.round(v)}%`}</b>}</div>
    </div>
  );
}
export function Progress({ value }: { value: number }) {
  return <div className="progress"><div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

/** Yig'ma ustunli grafik (davomat: o'z vaqtida / kechikkan / kelmagan) */
export function StackBars({ data, keys }: { data: { label: string; values: Record<string, number | string> }[]; keys: { key: string; color: string; label: string }[] }) {
  const v = (d: { values: Record<string, number | string> }, k: string) => Number(d.values[k]) || 0;
  const max = Math.max(1, ...data.map((d) => keys.reduce((s, k) => s + v(d, k.key), 0)));
  return (
    <div>
      <div className="bars">
        {data.map((d, i) => (
          <div className="b" key={i} title={keys.map((k) => `${k.label}: ${v(d, k.key)}`).join("\n")}>
            <div className="stackbar">
              {keys.map((k) => (
                <div key={k.key} style={{ height: `${(v(d, k.key) / max) * 100}%`, background: k.color }} />
              ))}
            </div>
            <div className="lbl">{d.label}</div>
          </div>
        ))}
      </div>
      <div className="legend mt-12">{keys.map((k) => <span key={k.key}><i style={{ background: k.color }} />{k.label}</span>)}</div>
    </div>
  );
}

/* ---------- Fayllar ---------- */
export function FilePicker({ files, onChange, accept = "image/*,application/pdf", max = 10, hint }: { files: File[]; onChange: (f: File[]) => void; accept?: string; max?: number; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (list: FileList | null) => {
    if (!list) return;
    onChange([...files, ...Array.from(list)].slice(0, max));
  };
  return (
    <div className="col gap-8">
      {files.length > 0 && (
        <div className="files">
          {files.map((f, i) => <LocalTile key={i} file={f} onRemove={() => onChange(files.filter((_, j) => j !== i))} />)}
        </div>
      )}
      {files.length < max && (
        <div className="row gap-8">
          {accept.includes("image") && (
            <Button variant="soft" className="grow hide-desktop" icon={<ImageIcon />} onClick={() => camera.current?.click()}>Suratga olish</Button>
          )}
          <div className={`drop grow ${over ? "over" : ""}`} onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }} style={{ padding: 14 }}>
            <Upload />
            <div className="bold small">Fayl tanlash</div>
            <div className="tiny subtle">{hint || "Rasm yoki PDF"}</div>
          </div>
        </div>
      )}
      <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function LocalTile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="file-tile">
      {url ? <img src={url} alt="" /> : <><FileText style={{ color: "var(--primary)" }} /><div className="name">{file.name}</div><div className="tiny subtle">{fileSize(file.size)}</div></>}
      <button className="remove" type="button" onClick={onRemove} aria-label="O'chirish"><X /></button>
    </div>
  );
}

export function FileGallery({ files, onRemove }: { files: FileInfo[]; onRemove?: (f: FileInfo) => void }) {
  const [view, setView] = useState<string | null>(null);
  const images = files.filter((f) => f.is_image);
  const docs = files.filter((f) => !f.is_image);
  return (
    <div className="col gap-8">
      {images.length > 0 && (
        <div className="files">
          {images.map((f) => (
            <div key={f.id} className="file-tile" onClick={() => setView(f.url)}>
              <img src={f.url} alt={f.name} loading="lazy" />
              {onRemove && <button className="remove" type="button" onClick={(e) => { e.stopPropagation(); onRemove(f); }} aria-label="O'chirish"><X /></button>}
            </div>
          ))}
        </div>
      )}
      {docs.map((f) => (
        <div key={f.id} className="file-row">
          <div className="icon"><FileText /></div>
          <div className="grow"><div className="ellipsis bold small">{f.name}</div><div className="tiny subtle">{fileSize(f.size)}{f.attempt && f.attempt > 1 ? ` · ${f.attempt}-urinish` : ""}</div></div>
          <a className="icon-btn" href={f.url} target="_blank" rel="noreferrer" aria-label="Ochish"><Download /></a>
          {onRemove && <IconButton label="O'chirish" onClick={() => onRemove(f)}><X /></IconButton>}
        </div>
      ))}
      {view && createPortal(
        <div className="lightbox" onClick={() => setView(null)}>
          <img src={view} alt="" />
          <span style={{ position: "absolute", top: 0, right: 10 }}><IconButton label="Yopish" onClick={() => setView(null)}><X /></IconButton></span>
        </div>, document.body)}
    </div>
  );
}

/* ---------- Status belgilari ---------- */
export const HW_STATE: Record<HwState, { label: string; tone: string; icon: ReactNode }> = {
  pending: { label: "Bajarilmagan", tone: "blue", icon: <Clock /> },
  submitted: { label: "Tekshirilmoqda", tone: "primary", icon: <Loader2 /> },
  revision: { label: "Qayta ishlash", tone: "amber", icon: <RotateCcw /> },
  accepted: { label: "Qabul qilindi", tone: "green", icon: <Check /> },
  overdue: { label: "Muddati o'tdi", tone: "red", icon: <AlertTriangle /> },
  missed: { label: "Topshirilmadi", tone: "red", icon: <XCircle /> },
};
export function HwBadge({ state }: { state: HwState }) {
  const s = HW_STATE[state];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

export const ATT_STATUS: Record<string, { label: string; tone: string; color: string }> = {
  present: { label: "Keldi", tone: "green", color: "var(--green)" },
  late: { label: "Kechikdi", tone: "amber", color: "var(--amber)" },
  absent: { label: "Kelmadi", tone: "red", color: "var(--red)" },
  excused: { label: "Sababli", tone: "blue", color: "var(--blue)" },
  pending: { label: "Kutilmoqda", tone: "gray", color: "var(--text-3)" },
  off: { label: "Dam olish", tone: "gray", color: "var(--text-3)" },
};
export function AttBadge({ status }: { status: string }) {
  const s = ATT_STATUS[status] || ATT_STATUS.off;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Mono({ children }: { children: ReactNode }) {
  return <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", background: "var(--surface-2)", padding: "2px 8px", borderRadius: 8, fontSize: 15, fontWeight: 650 }}>{children}</code>;
}
