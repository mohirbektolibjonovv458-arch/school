import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, GraduationCap, Plus, ScanFace } from "lucide-react";
import { api, ApiError, qs } from "../../lib/api";
import { useApi, useDebounced } from "../../lib/hooks";
import type { Paged, Subject, Teacher } from "../../lib/types";
import { Alert, Avatar, Badge, Button, Empty, Field, Input, ListSkeleton, Loader, SearchInput, Select, Sheet, Textarea } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";
import Credentials from "./Credentials";

export function TeacherForm({ open, onClose, onSaved, edit }: { open: boolean; onClose: () => void; onSaved: (t: Teacher) => void; edit?: Teacher | null }) {
  const toast = useToast();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const empty = { last_name: "", first_name: "", middle_name: "", phone: "", username: "", position: "O'qituvchi", category: "", birth_date: "", gender: "", hired_at: "", bio: "" };
  const [d, setD] = useState(empty);
  const [subs, setSubs] = useState<number[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<{ name: string; username: string; password: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    api<Subject[]>("subjects/").then(setSubjects).catch(() => {});
    setD(edit ? { last_name: edit.last_name, first_name: edit.first_name, middle_name: edit.middle_name, phone: edit.phone, username: edit.username, position: edit.position, category: edit.category, birth_date: edit.birth_date || "", gender: edit.gender, hired_at: edit.hired_at || "", bio: edit.bio } : empty);
    setSubs(edit?.subjects || []); setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit]);
  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { ...d, subjects: subs, birth_date: d.birth_date || null, hired_at: d.hired_at || null };
      const t = await api<Teacher>(edit ? `teachers/${edit.id}/` : "teachers/", { method: edit ? "PATCH" : "POST", body });
      onSaved(t);
      if (t.temp_password) setCreds({ name: t.full_name, username: t.username, password: t.temp_password });
      else toast("Saqlandi");
      onClose();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  return (
    <>
      <Sheet open={open} onClose={onClose} title={edit ? "O'qituvchini tahrirlash" : "Yangi o'qituvchi"} footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} disabled={!d.first_name.trim() || !d.last_name.trim()} onClick={save}>Saqlash</Button></>}>
        <div className="col gap-16">
          {err && <Alert tone="error">{err.message}</Alert>}
          <div className="form-grid two">
            <Field label="Familiya" error={err?.field("last_name")}><Input value={d.last_name} onChange={(e) => set("last_name", e.target.value)} autoComplete="off" /></Field>
            <Field label="Ism" error={err?.field("first_name")}><Input value={d.first_name} onChange={(e) => set("first_name", e.target.value)} autoComplete="off" /></Field>
            <Field label="Otasining ismi"><Input value={d.middle_name} onChange={(e) => set("middle_name", e.target.value)} /></Field>
            <Field label="Telefon" error={err?.field("phone")} help={!edit ? "Login sifatida ham ishlatiladi" : undefined}><Input type="tel" inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+998 90 123 45 67" /></Field>
            <Field label="Lavozim"><Input value={d.position} onChange={(e) => set("position", e.target.value)} /></Field>
            <Field label="Toifa"><Select value={d.category} onChange={(e) => set("category", e.target.value)}><option value="">—</option><option>Oliy toifa</option><option>1-toifa</option><option>2-toifa</option><option>Mutaxassis</option></Select></Field>
            <Field label="Tug'ilgan sana"><Input type="date" value={d.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></Field>
            <Field label="Ishga kirgan sana"><Input type="date" value={d.hired_at} onChange={(e) => set("hired_at", e.target.value)} /></Field>
            {edit && <Field label="Login" error={err?.field("username")} className="full"><Input value={d.username} onChange={(e) => set("username", e.target.value)} autoCapitalize="none" /></Field>}
          </div>
          <Field label="Fanlari">
            <div className="row wrap gap-8">
              {subjects.length === 0 && <span className="small subtle">Fanlar hali qo'shilmagan</span>}
              {subjects.map((s) => {
                const on = subs.includes(s.id);
                return <button type="button" key={s.id} className={`chip ${on ? "active" : ""}`} onClick={() => setSubs(on ? subs.filter((x) => x !== s.id) : [...subs, s.id])}>{s.name}</button>;
              })}
            </div>
          </Field>
          <Field label="Qisqacha ma'lumot"><Textarea rows={2} value={d.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
        </div>
      </Sheet>
      <Credentials data={creds} onClose={() => setCreds(null)} />
    </>
  );
}

const FACE: Record<string, { label: string; tone: string }> = {
  approved: { label: "Yuz ✓", tone: "green" }, pending: { label: "Tasdiq kutmoqda", tone: "amber" }, consent: { label: "Rozilik bor", tone: "blue" }, no_consent: { label: "", tone: "gray" },
};

export function TeacherList() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const state = useApi<Paged<Teacher>>(`teachers/${qs({ q: dq, page_size: 200, active: archived ? "0" : "" })}`);
  return (
    <div className="col gap-12">
      <div className="row gap-8">
        <div className="grow"><SearchInput value={q} onChange={setQ} placeholder="Ism, telefon yoki login" /></div>
        <Select value={archived ? "1" : ""} onChange={(e) => setArchived(!!e.target.value)} style={{ width: 120, flexShrink: 0 }}><option value="">Faol</option><option value="1">Arxiv</option></Select>
      </div>
      <Loader state={state} skeleton={<ListSkeleton rows={6} />}
        empty={(d) => d.results.length === 0 ? <Empty icon={<GraduationCap />} title={dq ? "Topilmadi" : archived ? "Arxiv bo'sh" : "Hali o'qituvchilar yo'q"} action={!dq && !archived ? <Button icon={<Plus />} onClick={() => setOpen(true)}>O'qituvchi qo'shish</Button> : undefined} /> : null}>
        {(d) => (
          <>
            <div className="small muted">{d.count} ta o'qituvchi</div>
            <div className="card pad-0">
              {d.results.map((t) => (
                <Link key={t.id} to={`/d/teachers/${t.id}`} className="list-item">
                  <Avatar name={t.full_name} url={t.avatar_url} size={44} />
                  <div className="grow">
                    <div className="bold ellipsis">{t.full_name}</div>
                    <div className="tiny muted ellipsis">{t.subject_names.join(", ") || t.position}{t.classes.length ? ` · ${t.classes.map((c) => c.name).join(", ")}` : ""}</div>
                  </div>
                  {FACE[t.face_status].label && <span className="hide-mobile"><Badge tone={FACE[t.face_status].tone} icon={<ScanFace />}>{FACE[t.face_status].label}</Badge></span>}
                  <ChevronRight className="chev" size={20} />
                </Link>
              ))}
            </div>
          </>
        )}
      </Loader>
      <button className="fab" onClick={() => setOpen(true)}><Plus />O'qituvchi</button>
      <TeacherForm open={open} onClose={() => setOpen(false)} onSaved={() => state.reload(true)} />
    </div>
  );
}

export default function Teachers() {
  return <Page title="O'qituvchilar"><TeacherList /></Page>;
}
