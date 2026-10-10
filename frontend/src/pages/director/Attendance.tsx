import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardEdit, History, LogIn, LogOut, ScanFace, Smartphone, UserRound } from "lucide-react";
import { api, ApiError, qs } from "../../lib/api";
import { addDays, fmtDate, isoDate, WEEKDAYS, isoWeekday } from "../../lib/format";
import { useApi, useInterval } from "../../lib/hooks";
import type { Teacher } from "../../lib/types";
import { Alert, AttBadge, ATT_STATUS, Avatar, Badge, Button, Empty, Field, IconButton, Input, ListSkeleton, Loader, SearchInput, Select, Sheet, Textarea } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";
import { METHOD } from "../teacher/Attendance";

interface Row {
  teacher: { id: number; full_name: string; position: string; avatar_url: string | null };
  status: string; status_label: string; expected_at: string | null; check_in: string | null; check_out: string | null;
  in_method: string | null; out_method: string | null; late_minutes: number; note: string; absence: { id: number; reason: string; note: string } | null;
}
interface Board {
  date: string; summary: Record<string, number>; rows: Row[];
  events: { id: number; type: string; at: string; method: string; teacher: { id: number; full_name: string }; device: string | null; photo_url: string | null; note: string }[];
}

export default function DirectorAttendance() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const date = params.get("date") || isoDate();
  const status = params.get("status") || "all";
  const [q, setQ] = useState("");
  const state = useApi<Board>(`attendance/board/${qs({ date })}`);
  const [sel, setSel] = useState<Row | null>(null);
  const [manual, setManual] = useState<{ teacher?: number; type: "in" | "out" } | null>(null);
  const [absence, setAbsence] = useState<{ teacher?: number } | null>(null);
  const isToday = date === isoDate();
  useInterval(() => { if (isToday) state.reload(true); }, 30000);

  const setDate = (d: string) => setParams((p) => { p.set("date", d); return p; }, { replace: true });
  const setStatus = (s: string) => setParams((p) => { s === "all" ? p.delete("status") : p.set("status", s); return p; }, { replace: true });
  const rows = useMemo(() => (state.data?.rows || []).filter((r) => (status === "all" || r.status === status || (status === "came" && (r.status === "present" || r.status === "late"))) && r.teacher.full_name.toLowerCase().includes(q.toLowerCase())), [state.data, status, q]);
  const s = state.data?.summary || {};
  const filters = [
    { key: "all", label: "Hammasi", n: s.total }, { key: "came", label: "Kelgan", n: s.came }, { key: "late", label: "Kechikkan", n: s.late },
    { key: "absent", label: "Kelmagan", n: s.absent }, { key: "excused", label: "Sababli", n: s.excused }, { key: "pending", label: "Kutilmoqda", n: s.pending },
  ];
  const d = new Date(date + "T00:00");

  return (
    <Page title="Davomat" actions={<IconButton label="Hisobotlar" onClick={() => nav("/d/reports")}><History /></IconButton>}>
      <div className="col gap-12">
        <div className="card row gap-8" style={{ padding: 8 }}>
          <IconButton label="Oldingi kun" onClick={() => setDate(isoDate(addDays(d, -1)))}><ChevronLeft /></IconButton>
          <label className="grow" style={{ textAlign: "center", position: "relative", cursor: "pointer" }}>
            <div className="bold">{isToday ? "Bugun" : WEEKDAYS[isoWeekday(d)]}, {fmtDate(date)}</div>
            <input type="date" value={date} max={isoDate()} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
          </label>
          <IconButton label="Keyingi kun" onClick={() => setDate(isoDate(addDays(d, 1)))} disabled={isToday}><ChevronRight /></IconButton>
        </div>
        <div className="chips">
          {filters.map((f) => (
            <button key={f.key} className={`chip ${status === f.key ? "active" : ""}`} onClick={() => setStatus(f.key)}>
              {f.key !== "all" && f.key !== "came" && <i style={{ width: 8, height: 8, borderRadius: 8, background: ATT_STATUS[f.key]?.color }} />}
              {f.label}<b className="num">{f.n ?? 0}</b>
            </button>
          ))}
        </div>
        <div className="row gap-8">
          <div className="grow"><SearchInput value={q} onChange={setQ} placeholder="O'qituvchini qidirish" /></div>
          <Button variant="secondary" icon={<ClipboardEdit />} onClick={() => setManual({ type: "in" })}><span className="hide-mobile">Qo'lda</span></Button>
          <Button variant="secondary" icon={<CalendarPlus />} onClick={() => setAbsence({})}><span className="hide-mobile">Sababli</span></Button>
        </div>

        <div className="split">
          <Loader state={state} skeleton={<ListSkeleton rows={8} />}
            empty={(b) => b.rows.length === 0 ? <Empty icon={<UserRound />} title="O'qituvchilar yo'q" text="Avval o'qituvchilarni qo'shing" action={<Link to="/d/teachers" className="btn btn-primary btn-sm">O'qituvchilar</Link>} /> : null}>
            {() => rows.length === 0 ? <div className="card small subtle" style={{ textAlign: "center" }}>Bu filtr bo'yicha hech kim yo'q</div> : (
              <div className="card pad-0">
                {rows.map((r) => (
                  <button key={r.teacher.id} className="list-item" onClick={() => setSel(r)}>
                    <Avatar name={r.teacher.full_name} url={r.teacher.avatar_url} size={42} />
                    <div className="grow">
                      <div className="bold small ellipsis">{r.teacher.full_name}</div>
                      <div className="row wrap gap-8 tiny muted num mt-4">
                        {r.check_in ? <span className="row gap-4"><LogIn size={13} style={{ color: "var(--green)" }} />{r.check_in}</span> : <span>Kutilgan: {r.expected_at || "—"}</span>}
                        {r.check_out && <span className="row gap-4"><LogOut size={13} />{r.check_out}</span>}
                        {r.in_method && <span>· {METHOD[r.in_method]}</span>}
                        {r.late_minutes > 0 && <b style={{ color: "var(--amber)" }}>+{r.late_minutes} daq.</b>}
                        {r.absence && <span>· {r.absence.reason}</span>}
                      </div>
                    </div>
                    <AttBadge status={r.status} />
                  </button>
                ))}
              </div>
            )}
          </Loader>
          <div className="col gap-12">
            <div className="section-title" style={{ margin: "4px 2px 0" }}><h2>Hodisalar jurnali</h2></div>
            {(state.data?.events || []).length === 0 ? <div className="card small subtle">Bu kunda skanlar yo'q</div> : (
              <div className="card pad-0">
                {state.data!.events.map((e) => (
                  <div key={e.id} className="list-item">
                    {e.photo_url ? <img src={e.photo_url} alt="" style={{ width: 42, height: 42, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} /> :
                      <div className={`stat-icon tone-${e.type === "in" ? "green" : "gray"}`} style={{ width: 42, height: 42 }}>{e.method === "face" ? <ScanFace /> : e.method === "pin" ? <Smartphone /> : <ClipboardEdit />}</div>}
                    <div className="grow">
                      <div className="small bold ellipsis">{e.teacher.full_name}</div>
                      <div className="tiny subtle">{e.type === "in" ? "Kirdi" : "Chiqdi"} · {METHOD[e.method]}{e.device ? ` · ${e.device}` : ""}{e.note ? ` · ${e.note}` : ""}</div>
                    </div>
                    <b className="num small">{e.at}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.teacher.full_name || ""}>
        {sel && (
          <div className="col gap-12">
            <div className="row gap-8 wrap"><AttBadge status={sel.status} />{sel.late_minutes > 0 && <Badge tone="amber">+{sel.late_minutes} daqiqa</Badge>}</div>
            <div className="grid-2">
              <div className="stat"><div className="label">Kutilgan</div><div className="value" style={{ fontSize: 20 }}>{sel.expected_at || "—"}</div></div>
              <div className="stat"><div className="label">Keldi / ketdi</div><div className="value" style={{ fontSize: 20 }}>{sel.check_in || "—"} / {sel.check_out || "—"}</div></div>
            </div>
            {sel.note && <Alert tone="info">{sel.note}</Alert>}
            <Button variant="secondary" icon={<LogIn />} onClick={() => { setManual({ teacher: sel.teacher.id, type: "in" }); setSel(null); }}>Kelish vaqtini kiritish</Button>
            {sel.check_in && <Button variant="secondary" icon={<LogOut />} onClick={() => { setManual({ teacher: sel.teacher.id, type: "out" }); setSel(null); }}>Ketish vaqtini kiritish</Button>}
            {!sel.check_in && <Button variant="secondary" icon={<CalendarPlus />} onClick={() => { setAbsence({ teacher: sel.teacher.id }); setSel(null); }}>Sababli deb belgilash</Button>}
            <Button variant="ghost" icon={<History />} onClick={() => nav(`/d/teachers/${sel.teacher.id}?tab=attendance`)}>Davomat tarixi</Button>
          </div>
        )}
      </Sheet>
      <ManualSheet open={!!manual} init={manual} date={date} onClose={() => setManual(null)} onSaved={() => state.reload(true)} />
      <AbsenceSheet open={!!absence} teacher={absence?.teacher} date={date} onClose={() => setAbsence(null)} onSaved={() => state.reload(true)} />
    </Page>
  );
}

function useTeachers(open: boolean) {
  const [list, setList] = useState<Teacher[]>([]);
  useEffect(() => { if (open && !list.length) api<{ results: Teacher[] }>("teachers/?page_size=200").then((r) => setList(r.results)).catch(() => {}); }, [open, list.length]);
  return list;
}

function ManualSheet({ open, init, date, onClose, onSaved }: { open: boolean; init: { teacher?: number; type: "in" | "out" } | null; date: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const teachers = useTeachers(open);
  const [teacher, setTeacher] = useState("");
  const [type, setType] = useState<"in" | "out">("in");
  const [time, setTime] = useState("08:00");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTeacher(init?.teacher ? String(init.teacher) : ""); setType(init?.type || "in"); setNote(""); setErr(null);
    const n = new Date();
    setTime(date === isoDate() ? `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}` : "08:00");
  }, [open, init, date]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api("attendance/manual/", { body: { teacher, type, date, time, note } });
      toast("Davomat kiritildi");
      onSaved(); onClose();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Qo'lda kiritish" footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} disabled={!teacher || !note.trim()} onClick={save}>Saqlash</Button></>}>
      <div className="col gap-16">
        {err && <Alert tone="error">{err.message}</Alert>}
        <Field label="O'qituvchi"><Select value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">Tanlang</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select></Field>
        <div className="form-grid two">
          <Field label="Turi"><Select value={type} onChange={(e) => setType(e.target.value as "in" | "out")}><option value="in">Keldi</option><option value="out">Ketdi</option></Select></Field>
          <Field label={`Vaqt (${fmtDate(date)})`} error={err?.field("time")}><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Sabab (jurnalda saqlanadi)" error={err?.field("note")}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: kiosk ishlamadi, o'qituvchi shaxsan ko'rindi" /></Field>
      </div>
    </Sheet>
  );
}

export const ABSENCE_REASONS = [
  { value: "sick", label: "Kasallik" }, { value: "vacation", label: "Ta'til" }, { value: "trip", label: "Xizmat safari" },
  { value: "training", label: "Malaka oshirish" }, { value: "family", label: "Oilaviy sabab" }, { value: "other", label: "Boshqa" },
];

export function AbsenceSheet({ open, teacher: initTeacher, date, onClose, onSaved }: { open: boolean; teacher?: number; date: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const teachers = useTeachers(open);
  const [teacher, setTeacher] = useState("");
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [reason, setReason] = useState("sick");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTeacher(initTeacher ? String(initTeacher) : ""); setFrom(date); setTo(date); setReason("sick"); setNote(""); setErr(null); } }, [open, initTeacher, date]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api("attendance/absences/", { body: { teacher, date_from: from, date_to: to, reason, note } });
      toast("Sababli kelmaslik qayd etildi");
      onSaved(); onClose();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Sababli kelmaslik" footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} disabled={!teacher} onClick={save}>Tasdiqlash</Button></>}>
      <div className="col gap-16">
        {err && <Alert tone="error">{err.message}</Alert>}
        <Field label="O'qituvchi"><Select value={teacher} onChange={(e) => setTeacher(e.target.value)} disabled={!!initTeacher}><option value="">Tanlang</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select></Field>
        <div className="form-grid two">
          <Field label="Boshlanish"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Tugash" error={err?.field("date_to")}><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Field label="Sabab"><Select value={reason} onChange={(e) => setReason(e.target.value)}>{ABSENCE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
        <Field label="Izoh"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: kasallik varaqasi №123" /></Field>
      </div>
    </Sheet>
  );
}
