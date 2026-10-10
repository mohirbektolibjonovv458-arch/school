import { useEffect, useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import type { Subject } from "../../lib/types";
import { Alert, Button, Empty, Field, Input, ListSkeleton, Loader, Sheet, SUBJECT_ICON_NAMES, SubjectIcon, useConfirm } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

const COLORS = ["#4F46E5", "#7C3AED", "#DB2777", "#E11D48", "#EA580C", "#D97706", "#16A34A", "#0D9488", "#0891B2", "#2563EB", "#475569"];
const PRESETS = [
  ["Matematika", "calculator"], ["Algebra", "calculator"], ["Geometriya", "calculator"], ["Ona tili", "pen"], ["Adabiyot", "book"], ["Ingliz tili", "languages"],
  ["Rus tili", "languages"], ["Fizika", "atom"], ["Kimyo", "flask"], ["Biologiya", "leaf"], ["Tarix", "landmark"], ["Geografiya", "globe"],
  ["Informatika", "code"], ["Jismoniy tarbiya", "dumbbell"], ["Musiqa", "music"], ["Tasviriy san'at", "palette"],
];

export default function Subjects() {
  const toast = useToast();
  const state = useApi<Subject[]>("subjects/");
  const [form, setForm] = useState<Subject | "new" | null>(null);
  const { confirm, el } = useConfirm();
  const [busy, setBusy] = useState(false);
  const addPresets = async () => {
    setBusy(true);
    const have = new Set((state.data || []).map((s) => s.name.toLowerCase()));
    let n = 0;
    for (const [i, [name, icon]] of PRESETS.entries()) {
      if (have.has(name.toLowerCase())) continue;
      try { await api("subjects/", { body: { name, icon, color: COLORS[i % COLORS.length] } }); n++; } catch { /* */ }
    }
    setBusy(false);
    toast(`${n} ta fan qo'shildi`);
    state.reload(true);
  };
  const del = async (s: Subject) => {
    if (!(await confirm(`«${s.name}» o'chirilsinmi?`, { danger: true, ok: "O'chirish" }))) return;
    try { await api(`subjects/${s.id}/`, { method: "DELETE" }); state.reload(true); } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Page title="Fanlar">
      <Loader state={state} skeleton={<ListSkeleton />}
        empty={(d) => d.length === 0 ? <Empty icon={<BookOpen />} title="Fanlar ro'yxati bo'sh" text="Standart maktab fanlarini bir bosishda qo'shing yoki o'zingiz kiriting" action={<Button loading={busy} onClick={addPresets}>Standart fanlarni qo'shish</Button>} /> : null}>
        {(d) => (
          <div className="col gap-12">
            <div className="grid-auto">
              {d.map((s) => (
                <div key={s.id} className="card hover row gap-12" onClick={() => setForm(s)}>
                  <SubjectIcon icon={s.icon} color={s.color} />
                  <div className="grow"><div className="bold ellipsis">{s.name}</div><div className="tiny subtle">{s.teacher_count} o'qituvchi</div></div>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); del(s); }} aria-label="O'chirish"><Trash2 /></button>
                </div>
              ))}
            </div>
            <Button variant="ghost" loading={busy} onClick={addPresets}>Yetishmayotgan standart fanlarni qo'shish</Button>
          </div>
        )}
      </Loader>
      <button className="fab" onClick={() => setForm("new")}><Plus />Fan</button>
      <SubjectForm open={!!form} edit={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={() => state.reload(true)} />
      {el}
    </Page>
  );
}

function SubjectForm({ open, edit, onClose, onSaved }: { open: boolean; edit: Subject | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState("book");
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(edit?.name || ""); setColor(edit?.color || COLORS[0]); setIcon(edit?.icon || "book"); setErr(null); } }, [open, edit]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api(edit ? `subjects/${edit.id}/` : "subjects/", { method: edit ? "PATCH" : "POST", body: { name, color, icon } });
      onSaved(); onClose();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={edit ? "Fanni tahrirlash" : "Yangi fan"} footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} disabled={!name.trim()} onClick={save}>Saqlash</Button></>}>
      <div className="col gap-16">
        {err && <Alert tone="error">{err.message}</Alert>}
        <div className="row gap-12"><SubjectIcon icon={icon} color={color} size={56} /><div className="grow"><Field label="Nomi" error={err?.field("name")}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field></div></div>
        <Field label="Rang"><div className="row wrap gap-8">{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} style={{ width: 36, height: 36, borderRadius: 12, background: c, border: color === c ? "3px solid var(--text)" : "3px solid transparent", cursor: "pointer" }} />)}</div></Field>
        <Field label="Belgi"><div className="row wrap gap-8">{SUBJECT_ICON_NAMES.map((i) => <button key={i} type="button" onClick={() => setIcon(i)} style={{ border: icon === i ? `2px solid ${color}` : "2px solid transparent", borderRadius: 15, padding: 0, background: "none", cursor: "pointer" }}><SubjectIcon icon={i} color={color} size={42} /></button>)}</div></Field>
      </div>
    </Sheet>
  );
}
