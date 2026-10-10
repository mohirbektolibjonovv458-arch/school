import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Send } from "lucide-react";
import { api, ApiError, upload } from "../../lib/api";
import { addDays, isoDate, toLocalInput } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { compressImage } from "../../lib/image";
import type { Assignment, HomeworkDetail } from "../../lib/types";
import { Alert, Button, Card, Empty, Field, FilePicker, Input, Loader, Select, Switch, Textarea } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

export default function HomeworkForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const teaching = useApi<Assignment[]>("my/teaching/");
  const existing = useApi<HomeworkDetail>(id ? `homework/${id}/` : null);
  const [cls, setCls] = useState(params.get("class") || "");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState(() => toLocalInput(new Date(`${isoDate(addDays(new Date(), 1))}T08:00`)));
  const [maxScore, setMax] = useState("5");
  const [allowLate, setAllowLate] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);

  useEffect(() => {
    const h = existing.data;
    if (!h) return;
    setCls(String(h.school_class.id)); setSubject(String(h.subject.id)); setTitle(h.title); setDesc(h.description);
    setDue(toLocalInput(h.due_at)); setMax(String(h.max_score)); setAllowLate(h.allow_late);
  }, [existing.data]);

  const classes = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of teaching.data || []) m.set(a.school_class, a.class_name);
    return [...m.entries()];
  }, [teaching.data]);
  const subjects = (teaching.data || []).filter((a) => String(a.school_class) === cls);
  useEffect(() => {
    if (!id && subjects.length && !subjects.some((s) => String(s.subject) === subject)) setSubject(String(subjects[0].subject));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls, teaching.data]);
  useEffect(() => { if (!cls && classes.length === 1) setCls(String(classes[0][0])); }, [classes, cls]);

  const quick = (days: number, hour = 8) => setDue(toLocalInput(new Date(`${isoDate(addDays(new Date(), days))}T${String(hour).padStart(2, "0")}:00`)));

  const submit = async () => {
    setErr(null);
    setProgress(0);
    try {
      const payload = { school_class: cls, subject, title, description: desc, due_at: new Date(due).toISOString(), max_score: maxScore, allow_late: String(allowLate) };
      let hid = id;
      if (id) {
        await api(`homework/${id}/`, { method: "PATCH", body: { ...payload, allow_late: allowLate } });
        if (files.length) {
          const fd = new FormData();
          for (const f of files) fd.append("files", await compressImage(f));
          await upload(`homework/${id}/files/`, fd, setProgress);
        }
      } else {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => fd.append(k, String(v)));
        for (const f of files) fd.append("files", await compressImage(f));
        const h = await upload<HomeworkDetail>("homework/", fd, setProgress);
        hid = String(h.id);
      }
      toast(id ? "Vazifa yangilandi" : "Vazifa joylandi, o'quvchilarga bildirishnoma yuborildi");
      nav(`/t/homework/${hid}`, { replace: true });
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setProgress(null);
    }
  };

  const valid = cls && subject && title.trim().length >= 3 && due;
  return (
    <Page title={id ? "Vazifani tahrirlash" : "Yangi vazifa"} back>
      <Loader state={teaching} empty={(d) => d.length === 0 ? <Empty title="Sizga sinf biriktirilmagan" text="Vazifa berish uchun direktor sizni sinf va fanga biriktirishi kerak" /> : null}>
        {() => (
          <div className="col gap-16" style={{ maxWidth: 720, margin: "0 auto" }}>
            {err && <Alert tone="error">{err.message}</Alert>}
            <Card>
              <div className="form-grid two">
                <Field label="Sinf" error={err?.field("school_class")}>
                  <Select value={cls} onChange={(e) => setCls(e.target.value)} disabled={!!id}>
                    <option value="">Tanlang</option>
                    {classes.map(([cid, name]) => <option key={cid} value={cid}>{name}</option>)}
                  </Select>
                </Field>
                <Field label="Fan" error={err?.field("subject")}>
                  <Select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!cls || !!id}>
                    {subjects.map((s) => <option key={s.subject} value={s.subject}>{s.subject_name}</option>)}
                  </Select>
                </Field>
                <Field label="Sarlavha" error={err?.field("title")} className="full">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Masalan: 45-mashq, 3–8 misollar" />
                </Field>
                <Field label="Topshiriq matni" className="full">
                  <Textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Nimani bajarish kerak, qanday topshirish kerak…" />
                </Field>
              </div>
            </Card>
            <Card title="Muddat va baholash">
              <div className="col gap-12">
                <div className="chips" style={{ margin: 0, padding: 0 }}>
                  <button type="button" className="chip" onClick={() => quick(1)}>Ertaga</button>
                  <button type="button" className="chip" onClick={() => quick(2)}>2 kundan keyin</button>
                  <button type="button" className="chip" onClick={() => quick(7)}>1 haftadan keyin</button>
                </div>
                <div className="form-grid two">
                  <Field label="Topshirish muddati" error={err?.field("due_at")}><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
                  <Field label="Maksimal ball" error={err?.field("max_score")}>
                    <Select value={maxScore} onChange={(e) => setMax(e.target.value)}>
                      <option value="5">5 ballik</option><option value="10">10 ballik</option><option value="12">12 ballik</option><option value="100">100 ballik</option>
                    </Select>
                  </Field>
                </div>
                <label className="row between"><span><b>Kech topshirishga ruxsat</b><div className="tiny subtle">Muddatdan keyin ham qabul qilinadi, «kech» deb belgilanadi</div></span><Switch checked={allowLate} onChange={setAllowLate} /></label>
              </div>
            </Card>
            <Card title={id ? "Qo'shimcha materiallar" : "Materiallar (ixtiyoriy)"}>
              <FilePicker files={files} onChange={setFiles} accept="image/*,application/pdf,.docx,.xlsx,.pptx" hint="Rasm, PDF, Word, Excel, PowerPoint" />
            </Card>
            <div className="sticky-actions">
              {progress !== null && files.length > 0 && <div className="progress" style={{ marginBottom: 8 }}><div style={{ width: `${progress}%` }} /></div>}
              <Button size="lg" block icon={<Send />} loading={progress !== null} disabled={!valid} onClick={submit}>{id ? "Saqlash" : "Joylash"}</Button>
            </div>
          </div>
        )}
      </Loader>
    </Page>
  );
}
