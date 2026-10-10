import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { api, ApiError, upload } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Announcement, SchoolClass } from "../../lib/types";
import { Alert, Button, Field, FilePicker, Input, Sheet, Switch, Textarea } from "../../ui";
import { useToast } from "../../ui/toast";

export const AUDIENCES = [
  { value: "all", label: "Hammaga" },
  { value: "staff", label: "O'qituvchilarga" },
  { value: "students", label: "O'quvchilarga" },
  { value: "classes", label: "Tanlangan sinflarga" },
];

export function ClassPicker({ classes, value, onChange }: { classes: SchoolClass[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="row wrap gap-8">
      {classes.map((c) => {
        const on = value.includes(c.id);
        return (
          <button type="button" key={c.id} className={`chip ${on ? "active" : ""}`} onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}>
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

export default function AnnouncementForm({ open, onClose, onSaved, edit }: { open: boolean; onClose: () => void; onSaved: (a: Announcement) => void; edit?: Announcement | null }) {
  const { user } = useAuth();
  const toast = useToast();
  const isManager = user?.role === "director" || user?.role === "admin";
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(isManager ? "all" : "classes");
  const [cls, setCls] = useState<number[]>([]);
  const [pinned, setPinned] = useState(false);
  const [important, setImportant] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    api<SchoolClass[]>("classes/").then(setClasses).catch(() => {});
    setTitle(edit?.title || ""); setBody(edit?.body || ""); setAudience(edit?.audience || (isManager ? "all" : "classes"));
    setCls(edit?.classes || []); setPinned(edit?.pinned || false); setImportant(edit?.important || false); setFiles([]); setErr(null);
  }, [open, edit, isManager]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      let a: Announcement;
      if (edit) {
        a = await api(`announcements/${edit.id}/`, { method: "PATCH", body: { title, body, audience, classes: cls, pinned, important } });
      } else {
        const fd = new FormData();
        fd.append("title", title); fd.append("body", body); fd.append("audience", audience);
        fd.append("pinned", String(pinned)); fd.append("important", String(important));
        cls.forEach((c) => fd.append("classes", String(c)));
        if (files[0]) fd.append("file", files[0]);
        a = await upload("announcements/", fd);
      }
      toast(edit ? "E'lon yangilandi" : "E'lon joylandi va bildirishnoma yuborildi");
      onSaved(a);
      onClose();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const audiences = isManager ? AUDIENCES : AUDIENCES.filter((a) => a.value === "classes");
  return (
    <Sheet open={open} onClose={onClose} title={edit ? "E'lonni tahrirlash" : "Yangi e'lon"}
      footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} icon={<Send />} onClick={submit} disabled={title.trim().length < 3 || !body.trim()}>{edit ? "Saqlash" : "Joylash"}</Button></>}>
      <div className="col gap-16">
        {err && <Alert tone="error">{err.message}</Alert>}
        <Field label="Sarlavha" error={err?.field("title")}><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Masalan: Ertaga ota-onalar majlisi" /></Field>
        <Field label="Matn" error={err?.field("body")}><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Batafsil ma'lumot…" /></Field>
        <Field label="Kimga">
          <div className="segment" style={{ flexWrap: "wrap" }}>
            {audiences.map((a) => <button type="button" key={a.value} className={audience === a.value ? "active" : ""} onClick={() => setAudience(a.value)}>{a.label}</button>)}
          </div>
        </Field>
        {audience === "classes" && (
          <Field label="Sinflar" error={err?.field("classes")}>
            {classes.length ? <ClassPicker classes={classes} value={cls} onChange={setCls} /> : <span className="subtle small">Sizga biriktirilgan sinf yo'q</span>}
          </Field>
        )}
        {!edit && <Field label="Ilova (ixtiyoriy)"><FilePicker files={files} onChange={setFiles} max={1} accept="image/*,application/pdf,.docx,.xlsx,.pptx" hint="Rasm, PDF yoki hujjat" /></Field>}
        <label className="row between"><span><b>Muhim</b><div className="tiny subtle">Qizil belgi bilan ajralib turadi</div></span><Switch checked={important} onChange={setImportant} /></label>
        {isManager && <label className="row between"><span><b>Yuqoriga qadash</b><div className="tiny subtle">Ro'yxat boshida turadi</div></span><Switch checked={pinned} onChange={setPinned} /></label>}
      </div>
    </Sheet>
  );
}
