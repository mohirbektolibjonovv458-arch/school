import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ClipboardCheck, GraduationCap, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { isoWeekday, WD_SHORT, WEEKDAYS } from "../../lib/format";
import { useApi, useDesktop } from "../../lib/hooks";
import type { Assignment, Lesson, Subject, Teacher } from "../../lib/types";
import { Alert, Badge, Button, Card, Empty, Field, IconButton, Input, Loader, Segment, Select, Sheet, Stat, useConfirm } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";
import { ClassOverview, StudentList } from "../teacher/ClassDetail";
import { TeacherHomeworkRow } from "../teacher/Homework";
import { ClassForm } from "./Classes";
import { StudentForm } from "./Students";

interface Period { id: number; number: number; start: string; end: string }

export default function DirectorClassDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<"students" | "teachers" | "timetable" | "homework">("students");
  const state = useApi<ClassOverview>(`classes/${id}/overview/`);
  const [edit, setEdit] = useState(false);
  const [addStudent, setAddStudent] = useState(false);
  const { confirm, el } = useConfirm();

  const del = async () => {
    if (!(await confirm("Sinfni o'chirasizmi?", { text: "Sinf bo'sh bo'lishi kerak. Jadval va biriktirishlar ham o'chadi.", danger: true, ok: "O'chirish" }))) return;
    try { await api(`classes/${id}/`, { method: "DELETE" }); toast("Sinf o'chirildi"); nav("/d/classes", { replace: true }); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Page title={state.data ? `${state.data.class.name} sinf` : "Sinf"} back="/d/classes"
      actions={state.data ? <><IconButton label="Tahrirlash" onClick={() => setEdit(true)}><Pencil /></IconButton><IconButton label="O'chirish" onClick={del}><Trash2 /></IconButton></> : null}>
      <Loader state={state}>
        {(d) => (
          <div className="col gap-16">
            <div className="grid-2 grid-4-md">
              <Stat label="O'quvchilar" value={d.stats.students} icon={<Users />} />
              <Stat label="O'qituvchilar" value={d.stats.teachers} icon={<GraduationCap />} tone="blue" />
              <Stat label="Uy vazifalari" value={d.stats.homework} icon={<ClipboardCheck />} tone="amber" />
              <Stat label="Topshirish darajasi" value={d.stats.submission_rate !== null ? `${d.stats.submission_rate}%` : "—"} tone="green" />
            </div>
            <div className="small muted">Sinf rahbari: <b>{d.class.homeroom_teacher_name || "belgilanmagan"}</b>{d.class.room ? ` · ${d.class.room}-xona` : ""} · {d.class.shift}-smena</div>
            <Segment value={tab} onChange={setTab} items={[
              { value: "students", label: "O'quvchilar", count: d.students.length }, { value: "teachers", label: "O'qituvchilar", count: d.assignments.length },
              { value: "timetable", label: "Jadval" }, { value: "homework", label: "Vazifalar" },
            ]} />
            {tab === "students" && (
              <div className="col gap-12">
                <Button variant="soft" icon={<UserPlus />} onClick={() => setAddStudent(true)}>O'quvchi qo'shish</Button>
                <StudentList students={d.students} />
              </div>
            )}
            {tab === "teachers" && <Assignments classId={d.class.id} items={d.assignments} onChange={() => state.reload(true)} />}
            {tab === "timetable" && <Timetable classId={d.class.id} lessons={d.lessons} assignments={d.assignments} onChange={() => state.reload(true)} />}
            {tab === "homework" && (d.homework.length === 0 ? <Empty icon={<ClipboardCheck />} title="Bu sinfga hali vazifa berilmagan" /> : <div className="card pad-0">{d.homework.map((h) => <TeacherHomeworkRow key={h.id} h={h} base="/d/homework" />)}</div>)}
            <ClassForm open={edit} edit={d.class} onClose={() => setEdit(false)} onSaved={() => state.reload(true)} />
            <StudentForm open={addStudent} onClose={() => setAddStudent(false)} onSaved={() => state.reload(true)} defaultClass={d.class.id} />
          </div>
        )}
      </Loader>
      {el}
    </Page>
  );
}

function Assignments({ classId, items, onChange }: { classId: number; items: Assignment[]; onChange: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teacher, setTeacher] = useState("");
  const [subject, setSubject] = useState("");
  const [hours, setHours] = useState("2");
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, el } = useConfirm();
  useEffect(() => {
    if (!open) return;
    api<{ results: Teacher[] }>("teachers/?page_size=200").then((r) => setTeachers(r.results)).catch(() => {});
    api<Subject[]>("subjects/").then(setSubjects).catch(() => {});
    setTeacher(""); setSubject(""); setErr(null);
  }, [open]);
  const sortedTeachers = useMemo(() => {
    if (!subject) return teachers;
    const sid = Number(subject);
    return [...teachers].sort((a, b) => Number(b.subjects.includes(sid)) - Number(a.subjects.includes(sid)));
  }, [teachers, subject]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api("teaching/", { body: { teacher: Number(teacher), school_class: classId, subject: Number(subject), hours_per_week: Number(hours) } });
      toast("O'qituvchi biriktirildi va xabardor qilindi");
      setOpen(false); onChange();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  const remove = async (a: Assignment) => {
    if (!(await confirm(`${a.teacher_name} — ${a.subject_name} biriktirishini olib tashlaysizmi?`, { danger: true, ok: "Olib tashlash" }))) return;
    await api(`teaching/${a.id}/`, { method: "DELETE" });
    onChange();
  };
  return (
    <div className="col gap-12">
      <Button variant="soft" icon={<Plus />} onClick={() => setOpen(true)}>O'qituvchi biriktirish</Button>
      {items.length === 0 ? <Empty icon={<GraduationCap />} title="Hali hech kim biriktirilmagan" text="Har bir fan uchun o'qituvchini biriktiring — shunda u bu sinfga vazifa bera oladi" /> : (
        <div className="card pad-0">
          {items.map((a) => (
            <div key={a.id} className="list-item">
              <span style={{ width: 10, height: 40, borderRadius: 4, background: a.subject_color, flexShrink: 0 }} />
              <div className="grow"><div className="bold small">{a.subject_name}</div><Link to={`/d/teachers/${a.teacher}`} className="small muted">{a.teacher_name}</Link></div>
              <Badge tone="gray">{a.hours_per_week} soat/hafta</Badge>
              <IconButton label="Olib tashlash" onClick={() => remove(a)}><Trash2 /></IconButton>
            </div>
          ))}
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="O'qituvchi biriktirish" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Bekor qilish</Button><Button loading={busy} disabled={!teacher || !subject} onClick={save}>Biriktirish</Button></>}>
        <div className="col gap-16">
          {err && <Alert tone="error">{err.message}</Alert>}
          {subjects.length === 0 && <Alert tone="warn">Avval <Link to="/d/subjects" className="link">fanlarni</Link> qo'shing.</Alert>}
          <Field label="Fan"><Select value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Tanlang</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="O'qituvchi" help="Shu fanni o'qitadiganlar ro'yxat boshida"><Select value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">Tanlang</option>{sortedTeachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}{subject && t.subjects.includes(Number(subject)) ? " ★" : ""}</option>)}</Select></Field>
          <Field label="Haftalik soat"><Input type="number" min={1} max={12} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        </div>
      </Sheet>
      {el}
    </div>
  );
}

function Timetable({ classId, lessons, assignments, onChange }: { classId: number; lessons: Lesson[]; assignments: Assignment[]; onChange: () => void }) {
  const desktop = useDesktop();
  const toast = useToast();
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [day, setDay] = useState(Math.min(isoWeekday(), 6));
  const [cell, setCell] = useState<{ weekday: number; period: number; lesson?: Lesson } | null>(null);
  const [subject, setSubject] = useState("");
  const [room, setRoom] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ periods: Period[] }>("school/").then((s) => setPeriods(s.periods)).catch(() => setPeriods([])); }, []);
  const at = (wd: number, p: number) => lessons.find((l) => l.weekday === wd && l.period === p);
  const openCell = (weekday: number, period: number) => {
    const lesson = at(weekday, period);
    setCell({ weekday, period, lesson }); setSubject(lesson ? String(lesson.subject) : assignments[0] ? String(assignments[0].subject) : ""); setRoom(lesson?.room || ""); setErr(null);
  };
  const save = async () => {
    if (!cell) return;
    setBusy(true); setErr(null);
    try {
      const body = { school_class: classId, subject: Number(subject), weekday: cell.weekday, period: cell.period, room, teacher: null };
      await api(cell.lesson ? `lessons/${cell.lesson.id}/` : "lessons/", { method: cell.lesson ? "PATCH" : "POST", body });
      setCell(null); onChange();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!cell?.lesson) return;
    await api(`lessons/${cell.lesson.id}/`, { method: "DELETE" });
    toast("Dars olib tashlandi");
    setCell(null); onChange();
  };
  if (periods === null) return <Card><div className="small subtle">Yuklanmoqda…</div></Card>;
  if (!periods.length) return <Empty title="Qo'ng'iroq jadvali kiritilmagan" text="Avval darslar vaqtini kiriting" action={<Link to="/d/settings" className="btn btn-primary btn-sm">Sozlamalarga o'tish</Link>} />;
  if (!assignments.length) return <Alert tone="warn">Jadval tuzishdan oldin «O'qituvchilar» bo'limida fanlarga o'qituvchi biriktiring.</Alert>;

  const Cell = ({ wd, p }: { wd: number; p: Period }) => {
    const l = at(wd, p.number);
    return (
      <button className={`tt-cell ${l ? "filled" : ""}`} onClick={() => openCell(wd, p.number)}
        style={l ? { background: `color-mix(in srgb, ${l.subject_color} 13%, transparent)`, borderLeft: `4px solid ${l.subject_color}` } : undefined}>
        {l ? <><b className="ellipsis">{l.subject_name}</b><span className="tiny muted ellipsis">{l.teacher_name || "—"}</span>{l.room && <span className="tiny subtle">{l.room}</span>}</> : <span className="tiny subtle">+ {desktop ? "" : `${p.number}-dars · ${p.start}`}</span>}
      </button>
    );
  };
  return (
    <>
      {desktop ? (
        <div className="card table-wrap">
          <div className="tt-grid" style={{ gridTemplateColumns: `90px repeat(6, minmax(0, 1fr))` }}>
            <div />
            {[1, 2, 3, 4, 5, 6].map((wd) => <div key={wd} className="tt-head">{WEEKDAYS[wd]}</div>)}
            {periods.map((p) => (
              <div key={p.number} style={{ display: "contents" }}>
                <div className="tiny subtle num" style={{ alignSelf: "center" }}><b>{p.number}-dars</b><br />{p.start}–{p.end}</div>
                {[1, 2, 3, 4, 5, 6].map((wd) => <Cell key={wd} wd={wd} p={p} />)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="col gap-12">
          <div className="chips">
            {[1, 2, 3, 4, 5, 6].map((wd) => (
              <button key={wd} className={`chip day-chip ${wd === day ? "active" : ""}`} onClick={() => setDay(wd)}>
                <span className="w">{WD_SHORT[wd]}</span><span className="d">{lessons.filter((l) => l.weekday === wd).length}</span>
              </button>
            ))}
          </div>
          {periods.map((p) => (
            <div key={p.number} className="row gap-8">
              <div className="tiny subtle num" style={{ width: 44, textAlign: "center" }}><b>{p.number}</b><br />{p.start}</div>
              <div className="grow"><Cell wd={day} p={p} /></div>
            </div>
          ))}
        </div>
      )}
      <Sheet open={!!cell} onClose={() => setCell(null)} title={cell ? `${WEEKDAYS[cell.weekday]}, ${cell.period}-dars` : ""}
        footer={<>{cell?.lesson && <Button variant="danger-soft" icon={<Trash2 />} onClick={remove}>O'chirish</Button>}<Button loading={busy} disabled={!subject} onClick={save}>Saqlash</Button></>}>
        <div className="col gap-16">
          {err && <Alert tone="error">{err.message}</Alert>}
          <Field label="Fan (o'qituvchi avtomatik qo'yiladi)">
            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {assignments.map((a) => <option key={a.subject} value={a.subject}>{a.subject_name} — {a.teacher_name}</option>)}
            </Select>
          </Field>
          <Field label="Xona (ixtiyoriy)"><Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="204" /></Field>
        </div>
      </Sheet>
    </>
  );
}
