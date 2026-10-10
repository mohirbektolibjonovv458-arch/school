import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, School } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import type { SchoolClass, Teacher } from "../../lib/types";
import { Alert, Badge, Button, Empty, Field, Input, ListSkeleton, Loader, Select, Sheet } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

export function ClassForm({ open, onClose, onSaved, edit }: { open: boolean; onClose: () => void; onSaved: (c: SchoolClass) => void; edit?: SchoolClass | null }) {
  const toast = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [d, setD] = useState({ grade: "1", letter: "A", room: "", shift: "1", homeroom_teacher: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    api<{ results: Teacher[] }>("teachers/?page_size=200").then((r) => setTeachers(r.results)).catch(() => {});
    setD(edit ? { grade: String(edit.grade), letter: edit.letter, room: edit.room, shift: String(edit.shift), homeroom_teacher: edit.homeroom_teacher ? String(edit.homeroom_teacher) : "" } : { grade: "1", letter: "A", room: "", shift: "1", homeroom_teacher: "" });
    setErr(null);
  }, [open, edit]);
  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { ...d, grade: Number(d.grade), shift: Number(d.shift), homeroom_teacher: d.homeroom_teacher ? Number(d.homeroom_teacher) : null };
      const c = await api<SchoolClass>(edit ? `classes/${edit.id}/` : "classes/", { method: edit ? "PATCH" : "POST", body });
      toast(edit ? "Sinf yangilandi" : `${c.name} sinf yaratildi`);
      onSaved(c); onClose();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={edit ? `${edit.name} sinfni tahrirlash` : "Yangi sinf"} footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} onClick={save}>Saqlash</Button></>}>
      <div className="col gap-16">
        {err && <Alert tone="error">{err.message}</Alert>}
        <div className="form-grid two">
          <Field label="Sinf" error={err?.field("grade")}><Select value={d.grade} onChange={(e) => set("grade", e.target.value)}>{Array.from({ length: 11 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}-sinf</option>)}</Select></Field>
          <Field label="Harfi" error={err?.field("letter")}><Input value={d.letter} maxLength={4} onChange={(e) => set("letter", e.target.value.toUpperCase())} /></Field>
          <Field label="Xona"><Input value={d.room} onChange={(e) => set("room", e.target.value)} placeholder="204" /></Field>
          <Field label="Smena"><Select value={d.shift} onChange={(e) => set("shift", e.target.value)}><option value="1">1-smena</option><option value="2">2-smena</option></Select></Field>
        </div>
        <Field label="Sinf rahbari"><Select value={d.homeroom_teacher} onChange={(e) => set("homeroom_teacher", e.target.value)}><option value="">Belgilanmagan</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select></Field>
      </div>
    </Sheet>
  );
}

export default function Classes() {
  const state = useApi<SchoolClass[]>("classes/");
  const [open, setOpen] = useState(false);
  const grades = new Map<number, SchoolClass[]>();
  for (const c of state.data || []) grades.set(c.grade, [...(grades.get(c.grade) || []), c]);
  const total = (state.data || []).reduce((s, c) => s + (c.student_count || 0), 0);
  return (
    <Page title="Sinflar">
      <Loader state={state} skeleton={<ListSkeleton />} empty={(d) => d.length === 0 ? <Empty icon={<School />} title="Hali sinflar yo'q" text="Maktabingizdagi sinflarni qo'shing: 1-A, 5-B, 11-A…" action={<Button icon={<Plus />} onClick={() => setOpen(true)}>Sinf qo'shish</Button>} /> : null}>
        {(d) => (
          <div className="col gap-16">
            <div className="small muted">{d.length} ta sinf · {total} o'quvchi</div>
            {[...grades.entries()].map(([g, list]) => (
              <div key={g}>
                <div className="nav-group" style={{ padding: "0 2px 8px" }}>{g}-sinflar</div>
                <div className="grid-auto">
                  {list.map((c) => (
                    <Link key={c.id} to={`/d/classes/${c.id}`} className="card hover row gap-12">
                      <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--grad)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 17, flexShrink: 0 }}>{c.name}</div>
                      <div className="grow">
                        <div className="bold">{c.student_count} o'quvchi</div>
                        <div className="small muted ellipsis">{c.homeroom_teacher_name || "Sinf rahbari yo'q"}</div>
                        {!c.is_active && <Badge tone="gray">Faol emas</Badge>}
                      </div>
                      <ChevronRight className="chev" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Loader>
      <button className="fab" onClick={() => setOpen(true)}><Plus />Sinf</button>
      <ClassForm open={open} onClose={() => setOpen(false)} onSaved={() => state.reload(true)} />
    </Page>
  );
}
