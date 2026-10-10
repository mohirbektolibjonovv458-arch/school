import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, CheckSquare, FileSpreadsheet, KeyRound, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { api, ApiError, qs, upload } from "../../lib/api";
import { useApi, useDebounced } from "../../lib/hooks";
import type { Paged, SchoolClass, Student } from "../../lib/types";
import { Alert, Avatar, Badge, Button, Empty, Field, Input, ListSkeleton, Loader, SearchInput, Select, Sheet, useConfirm } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";
import Credentials from "./Credentials";

export function StudentForm({ open, onClose, onSaved, edit, defaultClass }: { open: boolean; onClose: () => void; onSaved: (s: Student) => void; edit?: Student | null; defaultClass?: number }) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const empty = { last_name: "", first_name: "", middle_name: "", school_class: defaultClass ? String(defaultClass) : "", birth_date: "", gender: "", parent_name: "", parent_phone: "", address: "", username: "", student_no: "" };
  const [d, setD] = useState(empty);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<{ name: string; username: string; password: string } | null>(null);
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    api<SchoolClass[]>("classes/").then(setClasses).catch(() => {});
    setD(edit ? { last_name: edit.last_name, first_name: edit.first_name, middle_name: edit.middle_name, school_class: edit.school_class ? String(edit.school_class) : "", birth_date: edit.birth_date || "", gender: edit.gender, parent_name: edit.parent_name, parent_phone: edit.parent_phone, address: edit.address, username: edit.username, student_no: edit.student_no } : empty);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit]);
  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { ...d, school_class: d.school_class ? Number(d.school_class) : null, birth_date: d.birth_date || null };
      if (!edit) { delete (body as Partial<typeof body>).username; delete (body as Partial<typeof body>).student_no; }
      const s = await api<Student>(edit ? `students/${edit.id}/` : "students/", { method: edit ? "PATCH" : "POST", body });
      onSaved(s);
      if (s.temp_password) setCreds({ name: s.full_name, username: s.username, password: s.temp_password });
      else toast("Saqlandi");
      onClose();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  return (
    <>
      <Sheet open={open} onClose={onClose} title={edit ? "O'quvchini tahrirlash" : "Yangi o'quvchi"} footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} disabled={!d.first_name.trim() || !d.last_name.trim()} onClick={save}>Saqlash</Button></>}>
        <div className="col gap-16">
          {err && <Alert tone="error">{err.message}</Alert>}
          <div className="form-grid two">
            <Field label="Familiya"><Input value={d.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
            <Field label="Ism"><Input value={d.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
            <Field label="Otasining ismi"><Input value={d.middle_name} onChange={(e) => set("middle_name", e.target.value)} /></Field>
            <Field label="Sinf"><Select value={d.school_class} onChange={(e) => set("school_class", e.target.value)}><option value="">Sinfsiz</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Tug'ilgan sana"><Input type="date" value={d.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></Field>
            <Field label="Jinsi"><Select value={d.gender} onChange={(e) => set("gender", e.target.value)}><option value="">—</option><option value="m">O'g'il</option><option value="f">Qiz</option></Select></Field>
            <Field label="Ota-ona (F.I.Sh.)"><Input value={d.parent_name} onChange={(e) => set("parent_name", e.target.value)} /></Field>
            <Field label="Ota-ona telefoni" error={err?.field("parent_phone")}><Input type="tel" inputMode="tel" value={d.parent_phone} onChange={(e) => set("parent_phone", e.target.value)} placeholder="+998 90 123 45 67" /></Field>
            <Field label="Manzil" className="full"><Input value={d.address} onChange={(e) => set("address", e.target.value)} /></Field>
            {edit && <Field label="Login" error={err?.field("username")}><Input value={d.username} onChange={(e) => set("username", e.target.value)} autoCapitalize="none" /></Field>}
            {edit && <Field label="O'quvchi raqami"><Input value={d.student_no} onChange={(e) => set("student_no", e.target.value)} /></Field>}
          </div>
        </div>
      </Sheet>
      <Credentials data={creds} onClose={() => setCreds(null)} />
    </>
  );
}

function ImportSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: { full_name: string; class_name: string | null; username: string; temp_password: string }[]; errors: { row: number; error: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setFile(null); setResult(null); setErr(null); } }, [open]);
  const run = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      setResult(await upload("students/import/", fd));
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const downloadCreds = () => {
    if (!result) return;
    const rows = [["F.I.Sh.", "Sinf", "Login", "Vaqtinchalik parol"], ...result.created.map((c) => [c.full_name, c.class_name || "", c.username, c.temp_password])];
    const csv = "﻿" + rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "oquvchilar_loginlar.csv";
    a.click();
  };
  return (
    <Sheet open={open} onClose={onClose} title="O'quvchilarni import qilish" footer={result ? <><Button variant="secondary" onClick={onClose}>Yopish</Button>{result.created.length > 0 && <Button icon={<FileSpreadsheet />} onClick={downloadCreds}>Loginlarni yuklab olish</Button>}</> : <><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} disabled={!file} icon={<Upload />} onClick={run}>Import qilish</Button></>}>
      {result ? (
        <div className="col gap-12">
          <Alert tone="success"><b>{result.created.length}</b> ta o'quvchi qo'shildi.</Alert>
          {result.created.length > 0 && <Alert tone="warn">Loginlar va vaqtinchalik parollarni hozir yuklab oling — ular boshqa ko'rsatilmaydi.</Alert>}
          {result.errors.length > 0 && (
            <div className="card flat" style={{ background: "var(--red-soft)" }}>
              <div className="bold small" style={{ color: "var(--red)" }}>{result.errors.length} ta qatorda xato:</div>
              {result.errors.slice(0, 20).map((e) => <div key={e.row} className="tiny mt-4">{e.row}-qator: {e.error}</div>)}
            </div>
          )}
        </div>
      ) : (
        <div className="col gap-12">
          {err && <Alert tone="error">{err}</Alert>}
          <p className="small muted">Excel'da quyidagi ustunlar bilan jadval tuzing va <b>CSV</b> formatida saqlang:</p>
          <div className="card flat tiny" style={{ background: "var(--surface-2)", fontFamily: "ui-monospace, monospace", overflowX: "auto" }}>
            Familiya;Ism;Otasining ismi;Sinf;Ota-ona telefoni;Tug'ilgan sana<br />Karimov;Jasur;Akmalovich;9-A;901234567;2011-05-14
          </div>
          <p className="tiny subtle">Sinflar oldindan yaratilgan bo'lishi kerak. Har bir o'quvchiga avtomatik login va parol beriladi.</p>
          <div className="drop" onClick={() => ref.current?.click()}>
            <FileSpreadsheet />
            <div className="bold small">{file ? file.name : "CSV faylni tanlang"}</div>
          </div>
          <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
      )}
    </Sheet>
  );
}

export function StudentList() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [cls, setCls] = useState("");
  const classes = useApi<SchoolClass[]>("classes/");
  const state = useApi<Paged<Student>>(`students/${qs({ q: dq, class: cls === "none" ? "" : cls, no_class: cls === "none" ? 1 : "", page_size: 200 })}`);
  const [form, setForm] = useState<Student | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ name: string; username: string; password: string } | null>(null);
  const [menu, setMenu] = useState<Student | null>(null);
  const { confirm, el } = useConfirm();

  const reset = async (s: Student) => {
    setMenu(null);
    if (!(await confirm(`${s.full_name} parolini tiklaysizmi?`))) return;
    const r = await api<{ username: string; temp_password: string }>(`students/${s.id}/reset-password/`, { method: "POST" });
    setCreds({ name: s.full_name, username: r.username, password: r.temp_password });
  };
  const archive = async (s: Student) => {
    setMenu(null);
    if (!(await confirm(`${s.full_name} arxivlansinmi?`, { text: "Tizimga kira olmaydi, ma'lumotlari saqlanadi.", danger: true, ok: "Arxivlash" }))) return;
    await api(`students/${s.id}/`, { method: "DELETE" });
    toast("Arxivlandi"); state.reload(true);
  };
  const move = async () => {
    await api("students/move/", { body: { ids: sel, school_class: moveTo ? Number(moveTo) : null } });
    toast(`${sel.length} ta o'quvchi ko'chirildi`);
    setSel([]); setSelecting(false); setMoveTo(null); state.reload(true);
  };

  return (
    <div className="col gap-12">
      <div className="row gap-8">
        <div className="grow"><SearchInput value={q} onChange={setQ} placeholder="Ism, login, ota-ona telefoni" /></div>
        <Select value={cls} onChange={(e) => setCls(e.target.value)} style={{ width: 120, flexShrink: 0 }}>
          <option value="">Barchasi</option><option value="none">Sinfsiz</option>
          {(classes.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div className="row gap-8 wrap">
        <Button size="sm" variant="secondary" icon={<Upload />} onClick={() => setImporting(true)}>CSV import</Button>
        <Button size="sm" variant={selecting ? "soft" : "secondary"} icon={<CheckSquare />} onClick={() => { setSelecting(!selecting); setSel([]); }}>{selecting ? "Bekor qilish" : "Tanlash"}</Button>
        {selecting && sel.length > 0 && <Button size="sm" icon={<ArrowRightLeft />} onClick={() => setMoveTo("")}>{sel.length} tasini ko'chirish</Button>}
      </div>
      <Loader state={state} skeleton={<ListSkeleton rows={8} />}
        empty={(d) => d.results.length === 0 ? <Empty icon={<Users />} title={dq || cls ? "Topilmadi" : "Hali o'quvchilar yo'q"} text={!dq && !cls ? "Bittalab qo'shing yoki CSV fayldan import qiling" : undefined} /> : null}>
        {(d) => (
          <>
            <div className="small muted">{d.count} ta o'quvchi</div>
            <div className="card pad-0">
              {d.results.map((s) => (
                <button key={s.id} className="list-item" onClick={() => selecting ? setSel(sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id]) : setMenu(s)}>
                  {selecting && <input type="checkbox" readOnly checked={sel.includes(s.id)} style={{ width: 20, height: 20, accentColor: "var(--primary)" }} />}
                  <Avatar name={s.full_name} url={s.avatar_url} size={42} />
                  <div className="grow">
                    <div className="bold small ellipsis">{s.full_name}</div>
                    <div className="tiny muted ellipsis">Login: {s.username}{s.parent_phone ? ` · ${s.parent_phone}` : ""}</div>
                  </div>
                  <Badge tone={s.class_name ? "primary" : "gray"}>{s.class_name || "Sinfsiz"}</Badge>
                </button>
              ))}
            </div>
          </>
        )}
      </Loader>
      <button className="fab" onClick={() => setForm("new")}><Plus />O'quvchi</button>
      <StudentForm open={!!form} edit={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={() => state.reload(true)} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} onDone={() => state.reload(true)} />
      <Credentials data={creds} onClose={() => setCreds(null)} />
      <Sheet open={moveTo !== null} onClose={() => setMoveTo(null)} title={`${sel.length} ta o'quvchini ko'chirish`} footer={<><Button variant="secondary" onClick={() => setMoveTo(null)}>Bekor qilish</Button><Button onClick={move}>Ko'chirish</Button></>}>
        <Field label="Yangi sinf"><Select value={moveTo || ""} onChange={(e) => setMoveTo(e.target.value)}><option value="">Sinfsiz</option>{(classes.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      </Sheet>
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.full_name || ""}>
        {menu && (
          <div className="col gap-8">
            <div className="small muted">{menu.class_name || "Sinfsiz"} · Login: <b>{menu.username}</b> · ID {menu.student_no}</div>
            {menu.parent_name && <div className="small">Ota-ona: {menu.parent_name} {menu.parent_phone && <a className="link" href={`tel:${menu.parent_phone}`}>{menu.parent_phone}</a>}</div>}
            <Button variant="secondary" icon={<Pencil />} onClick={() => { setForm(menu); setMenu(null); }}>Tahrirlash</Button>
            <Button variant="secondary" icon={<KeyRound />} onClick={() => reset(menu)}>Parolni tiklash</Button>
            <Button variant="danger-soft" icon={<Trash2 />} onClick={() => archive(menu)}>Arxivlash</Button>
          </div>
        )}
      </Sheet>
      {el}
    </div>
  );
}

export default function Students() {
  return <Page title="O'quvchilar"><StudentList /></Page>;
}

