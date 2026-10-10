import { useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, Check, MessageSquareText, RotateCcw, Send, Star, Upload, UserRound } from "lucide-react";
import { ApiError, upload } from "../../lib/api";
import { dueIn, fmtDateTime } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { compressImage } from "../../lib/image";
import type { HomeworkDetail, SubmissionT } from "../../lib/types";
import { Alert, Badge, Button, Card, Field, FileGallery, FilePicker, HwBadge, Loader, Progress, SubjectIcon, Textarea } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

export function SubmissionTimeline({ s }: { s: SubmissionT }) {
  const meta: Record<string, { label: string; tone: string; icon: JSX.Element }> = {
    submitted: { label: "Topshirildi", tone: "var(--primary)", icon: <Upload /> },
    resubmitted: { label: "Qayta topshirildi", tone: "var(--primary)", icon: <Upload /> },
    revision: { label: "Qayta ishlashga qaytarildi", tone: "var(--amber)", icon: <RotateCcw /> },
    accepted: { label: "Qabul qilindi", tone: "var(--green)", icon: <Check /> },
  };
  return (
    <div className="timeline">
      {s.events.map((e) => {
        const m = meta[e.action] || meta.submitted;
        return (
          <div key={e.id} className="tl-item">
            <span className="tl-dot" style={{ background: m.tone, color: "#fff" }}>{m.icon}</span>
            <div className="small bold">{m.label}{e.score !== null && e.action === "accepted" ? ` · ${e.score}/${s.homework.max_score}` : ""}</div>
            <div className="tiny subtle">{fmtDateTime(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ""}</div>
            {e.note && <div className="small muted pre mt-4" style={{ background: "var(--surface-2)", padding: "8px 10px", borderRadius: 10 }}>{e.note}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function StudentHomeworkDetail() {
  const { id } = useParams();
  const toast = useToast();
  const state = useApi<HomeworkDetail>(`homework/${id}/`);
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);

  const submit = async () => {
    setErr(null);
    setProgress(0);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", await compressImage(f));
      fd.append("comment", comment);
      await upload(`homework/${id}/submit/`, fd, setProgress);
      toast("Ish yuborildi! O'qituvchi tekshirgach xabar olasiz");
      setFiles([]);
      setComment("");
      state.reload(true);
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Page title="Vazifa" back="/s/homework">
      <Loader state={state}>
        {(h) => {
          const sub = h.my_submission;
          const st = h.my?.state || "pending";
          const due = dueIn(h.due_at);
          const canSubmit = (!sub || sub.status === "revision") && !h.is_closed && (h.allow_late || !due.overdue);
          return (
            <div className="split">
              <div className="col gap-16">
                <div className="card">
                  <div className="row gap-12">
                    <SubjectIcon icon={h.subject.icon} color={h.subject.color} size={48} />
                    <div className="grow">
                      <div className="small bold" style={{ color: h.subject.color }}>{h.subject.name}</div>
                      <div className="small muted row gap-4"><UserRound size={14} />{h.teacher_name}</div>
                    </div>
                    <HwBadge state={st} />
                  </div>
                  <h1 className="h2 mt-16">{h.title}</h1>
                  <div className="row wrap gap-8 mt-12">
                    <Badge tone={due.tone} icon={<CalendarClock />}>{fmtDateTime(h.due_at)}</Badge>
                    {!sub && <Badge tone={due.tone}>{due.text}</Badge>}
                    <Badge tone="gray" icon={<Star />}>Maks. {h.max_score} ball</Badge>
                  </div>
                  {h.description && <p className="pre mt-16" style={{ lineHeight: 1.65 }}>{h.description}</p>}
                  {h.files.length > 0 && <div className="mt-16"><div className="label" style={{ marginBottom: 8 }}>Materiallar</div><FileGallery files={h.files} /></div>}
                </div>

                {sub?.status === "accepted" && (
                  <div className="card" style={{ background: "var(--green-soft)", borderColor: "transparent" }}>
                    <div className="row gap-16">
                      <div style={{ width: 64, height: 64, borderRadius: 20, background: "var(--green)", color: "#fff", display: "grid", placeItems: "center", fontSize: 26, fontWeight: 800 }}>{sub.score}</div>
                      <div className="grow"><div className="h3">Bahoingiz: {sub.score}/{h.max_score}</div><div className="small muted">{sub.reviewed_by_name} · {fmtDateTime(sub.reviewed_at)}</div></div>
                    </div>
                    {sub.feedback && <div className="row-top gap-8 mt-12"><MessageSquareText size={18} style={{ color: "var(--green)", flexShrink: 0 }} /><div className="pre">{sub.feedback}</div></div>}
                  </div>
                )}
                {sub?.status === "revision" && (
                  <Alert tone="warn" icon={<RotateCcw />}>
                    <b>O'qituvchi qayta ishlashni so'radi</b>
                    <div className="pre mt-4">{sub.feedback}</div>
                  </Alert>
                )}
                {sub?.status === "submitted" && <Alert tone="info">Ishingiz yuborildi va tekshirilmoqda. Natija chiqqanda bildirishnoma keladi.</Alert>}

                {canSubmit ? (
                  <Card title={sub ? "Tuzatilgan ishni yuborish" : "Ishni topshirish"}>
                    <div className="col gap-16">
                      {due.overdue && <Alert tone="warn">Muddat o'tgan — ish «kech topshirilgan» deb belgilanadi.</Alert>}
                      {err && <Alert tone="error">{err.message}</Alert>}
                      <FilePicker files={files} onChange={setFiles} hint="Daftar rasmi yoki PDF, 10 tagacha" />
                      <Field label="Izoh (ixtiyoriy)"><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="O'qituvchiga izoh…" /></Field>
                      {progress !== null && <div className="col gap-4"><Progress value={progress} /><span className="tiny subtle">Yuklanmoqda… {progress}%</span></div>}
                      <Button size="lg" block icon={<Send />} loading={progress !== null} disabled={!files.length} onClick={submit}>Yuborish</Button>
                    </div>
                  </Card>
                ) : !sub && (
                  <Alert tone="error">Topshirish muddati tugagan.</Alert>
                )}
              </div>

              {sub && (
                <div className="col gap-16">
                  <Card title={`Mening ishim${sub.attempt > 1 ? ` · ${sub.attempt}-urinish` : ""}`} action={sub.is_late ? <Badge tone="amber">Kech topshirilgan</Badge> : null}>
                    {sub.comment && <p className="small muted pre" style={{ marginBottom: 12 }}>{sub.comment}</p>}
                    <FileGallery files={sub.files} />
                  </Card>
                  <Card title="Tarix"><SubmissionTimeline s={sub} /></Card>
                </div>
              )}
            </div>
          );
        }}
      </Loader>
    </Page>
  );
}
