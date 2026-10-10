import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, Trash2 } from "lucide-react";
import { api, ApiError, qs } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtTime, isoDate, toLocalInput } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { EventT, SchoolClass } from "../../lib/types";
import { Alert, Badge, Button, Empty, Field, IconButton, Input, ListSkeleton, Loader, Select, Sheet, Textarea, useConfirm } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";
import { AUDIENCES, ClassPicker } from "./AnnouncementForm";

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
export const EVENT_KIND: Record<string, { label: string; color: string; tone: string }> = {
  meeting: { label: "Yig'ilish", color: "#4F46E5", tone: "primary" },
  exam: { label: "Nazorat", color: "#E11D48", tone: "red" },
  event: { label: "Tadbir", color: "#059669", tone: "green" },
  holiday: { label: "Dam olish", color: "#D97706", tone: "amber" },
  parents: { label: "Ota-onalar majlisi", color: "#2563EB", tone: "blue" },
};

export default function Calendar() {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<EventT | "new" | null>(null);
  const from = isoDate(month);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const state = useApi<EventT[]>(`events/${qs({ from, to: isoDate(last) })}`);
  const { confirm, el } = useConfirm();
  const toast = useToast();

  const byDay = useMemo(() => {
    const m: Record<string, EventT[]> = {};
    for (const e of state.data || []) (m[isoDate(new Date(e.starts_at))] ||= []).push(e);
    return m;
  }, [state.data]);

  const cells: (Date | null)[] = [];
  const offset = (month.getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  const today = isoDate();
  const list = selected ? byDay[selected] || [] : state.data || [];
  const shift = (n: number) => { setSelected(null); setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1)); };

  const del = async (e: EventT) => {
    if (!(await confirm(`«${e.title}» o'chirilsinmi?`, { danger: true, ok: "O'chirish" }))) return;
    await api(`events/${e.id}/`, { method: "DELETE" });
    toast("O'chirildi");
    state.reload(true);
  };

  return (
    <Page title="Taqvim">
      <div className="split">
        <div className="card">
          <div className="row between" style={{ marginBottom: 12 }}>
            <IconButton label="Oldingi oy" onClick={() => shift(-1)}><ChevronLeft /></IconButton>
            <div className="h3">{MONTHS[month.getMonth()]} {month.getFullYear()}</div>
            <IconButton label="Keyingi oy" onClick={() => shift(1)}><ChevronRight /></IconButton>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center" }}>
            {["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"].map((d) => <div key={d} className="tiny subtle bold" style={{ padding: "4px 0" }}>{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const k = isoDate(d);
              const evs = byDay[k] || [];
              const sel = selected === k;
              return (
                <button key={i} onClick={() => setSelected(sel ? null : k)} style={{
                  aspectRatio: "1", borderRadius: 12, border: 0, cursor: "pointer", fontWeight: k === today ? 750 : 550, fontSize: 15,
                  background: sel ? "var(--primary)" : k === today ? "var(--primary-soft)" : "transparent", color: sel ? "#fff" : k === today ? "var(--primary-text)" : "inherit",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                }}>
                  {d.getDate()}
                  <span style={{ display: "flex", gap: 2, height: 5 }}>
                    {evs.slice(0, 3).map((e) => <i key={e.id} style={{ width: 5, height: 5, borderRadius: 5, background: sel ? "#fff" : EVENT_KIND[e.kind]?.color }} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="col gap-12">
          <div className="section-title" style={{ margin: "8px 2px 0" }}>
            <h2>{selected ? new Date(selected + "T00:00").toLocaleDateString("uz-UZ", { day: "numeric", month: "long" }) : "Shu oydagi tadbirlar"}</h2>
            {selected && <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Hammasi</Button>}
          </div>
          <Loader state={state} skeleton={<ListSkeleton rows={3} />}>
            {() => list.length === 0 ? <Empty icon={<CalendarDays />} title="Tadbirlar yo'q" text="Yig'ilishlar, nazoratlar va bayramlar shu yerda ko'rinadi" /> : (
              <div className="col gap-8">
                {list.map((e) => {
                  const k = EVENT_KIND[e.kind] || EVENT_KIND.event;
                  const d = new Date(e.starts_at);
                  return (
                    <div key={e.id} className="card row-top" style={{ padding: 14 }}>
                      <div style={{ width: 52, textAlign: "center", flexShrink: 0, borderRadius: 14, padding: "6px 0", background: `color-mix(in srgb, ${k.color} 12%, transparent)`, color: k.color }}>
                        <div style={{ fontSize: 20, fontWeight: 750, lineHeight: 1.1 }}>{d.getDate()}</div>
                        <div className="tiny bold">{MONTHS[d.getMonth()].slice(0, 3)}</div>
                      </div>
                      <div className="grow">
                        <div className="row wrap gap-6"><Badge tone={k.tone}>{k.label}</Badge><span className="small subtle num">{fmtTime(e.starts_at)}{e.ends_at ? `–${fmtTime(e.ends_at)}` : ""}</span></div>
                        <div className="bold mt-4">{e.title}</div>
                        {e.location && <div className="small muted row gap-4 mt-4"><MapPin size={14} />{e.location}</div>}
                        {e.description && <div className="small muted mt-4 pre clamp-2">{e.description}</div>}
                      </div>
                      {e.can_edit && <IconButton label="O'chirish" onClick={() => del(e)}><Trash2 /></IconButton>}
                    </div>
                  );
                })}
              </div>
            )}
          </Loader>
        </div>
      </div>
      {user?.role !== "student" && <button className="fab" onClick={() => setForm("new")}><Plus />Tadbir</button>}
      <EventForm open={!!form} onClose={() => setForm(null)} onSaved={() => state.reload(true)} defaultDate={selected} />
      {el}
    </Page>
  );
}

function EventForm({ open, onClose, onSaved, defaultDate }: { open: boolean; onClose: () => void; onSaved: () => void; defaultDate: string | null }) {
  const { user } = useAuth();
  const toast = useToast();
  const isManager = user?.role === "director" || user?.role === "admin";
  const [d, setD] = useState({ title: "", description: "", kind: "meeting", starts_at: "", ends_at: "", location: "", audience: isManager ? "staff" : "classes" });
  const [cls, setCls] = useState<number[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    api<SchoolClass[]>("classes/").then(setClasses).catch(() => {});
    const base = defaultDate ? new Date(defaultDate + "T15:00") : new Date(Date.now() + 86400000);
    if (!defaultDate) base.setHours(15, 0, 0, 0);
    setD({ title: "", description: "", kind: "meeting", starts_at: toLocalInput(base), ends_at: "", location: "", audience: isManager ? "staff" : "classes" });
    setCls([]); setErr(null);
  }, [open, defaultDate, isManager]);
  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api("events/", { body: { ...d, starts_at: new Date(d.starts_at).toISOString(), ends_at: d.ends_at ? new Date(d.ends_at).toISOString() : null, classes: cls } });
      toast("Tadbir qo'shildi, ishtirokchilarga xabar yuborildi");
      onSaved(); onClose();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Yangi tadbir"
      footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} onClick={submit} disabled={!d.title.trim() || !d.starts_at}>Qo'shish</Button></>}>
      <div className="col gap-16">
        {err && <Alert tone="error">{err.message}</Alert>}
        <Field label="Nomi"><Input value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Pedagogik kengash" /></Field>
        <Field label="Turi">
          <Select value={d.kind} onChange={(e) => set("kind", e.target.value)}>
            {Object.entries(EVENT_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <div className="form-grid two">
          <Field label="Boshlanishi" error={err?.field("starts_at")}><Input type="datetime-local" value={d.starts_at} onChange={(e) => set("starts_at", e.target.value)} /></Field>
          <Field label="Tugashi (ixtiyoriy)" error={err?.field("ends_at")}><Input type="datetime-local" value={d.ends_at} onChange={(e) => set("ends_at", e.target.value)} /></Field>
        </div>
        <Field label="Joyi"><Input value={d.location} onChange={(e) => set("location", e.target.value)} placeholder="Majlislar zali" /></Field>
        <Field label="Izoh"><Textarea rows={3} value={d.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <Field label="Kimlar uchun">
          <Select value={d.audience} onChange={(e) => set("audience", e.target.value)} disabled={!isManager}>
            {(isManager ? AUDIENCES : AUDIENCES.filter((a) => a.value === "classes")).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
        </Field>
        {d.audience === "classes" && <Field label="Sinflar" error={err?.field("classes")}><ClassPicker classes={classes} value={cls} onChange={setCls} /></Field>}
      </div>
    </Sheet>
  );
}
