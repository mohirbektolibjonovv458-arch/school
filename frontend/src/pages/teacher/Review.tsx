import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ChevronRight, MessageSquareText, RotateCcw } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { Paged, SubmissionT } from "../../lib/types";
import { Alert, Avatar, Badge, Button, Card, Field, FileGallery, Input, Loader, Textarea } from "../../ui";
import { Page, useCounts } from "../../ui/Shell";
import { useToast } from "../../ui/toast";
import { SubmissionTimeline } from "../student/HomeworkDetail";

export default function Review() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { refresh } = useCounts();
  const state = useApi<SubmissionT>(`submissions/${id}/`);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<"accept" | "revision" | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [next, setNext] = useState<number | null>(null);

  useEffect(() => {
    const s = state.data;
    if (!s) return;
    setScore(s.score);
    setFeedback(s.status === "submitted" ? "" : s.feedback);
    api<Paged<SubmissionT>>(`submissions/?status=submitted&page_size=50`).then((r) => {
      const others = r.results.filter((x) => x.id !== s.id);
      const same = others.find((x) => x.homework.id === s.homework.id);
      setNext((same || others[0])?.id ?? null);
    }).catch(() => {});
  }, [state.data]);

  const review = async (action: "accept" | "revision") => {
    setBusy(action);
    setErr(null);
    try {
      const s = await api<SubmissionT>(`submissions/${id}/review/`, { body: { action, score: action === "accept" ? score : null, feedback } });
      state.setData(s);
      refresh();
      toast(action === "accept" ? `Baho qo'yildi: ${score}` : "Qayta ishlashga qaytarildi");
      if (next) nav(`/t/review/${next}`, { replace: true });
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page title="Ishni tekshirish" back>
      <Loader state={state}>
        {(s) => {
          const max = s.homework.max_score;
          const options = max <= 12 ? Array.from({ length: max }, (_, i) => i + 1) : [];
          return (
            <div className="split">
              <div className="col gap-16">
                <Card>
                  <div className="row gap-12">
                    <Avatar name={s.student.full_name} url={s.student.avatar_url} size={48} />
                    <div className="grow">
                      <div className="h3 ellipsis">{s.student.full_name}</div>
                      <div className="small muted ellipsis">{s.homework.class_name} · {s.homework.subject.name}</div>
                    </div>
                  </div>
                  <div className="bold mt-12">{s.homework.title}</div>
                  <div className="row wrap gap-6 mt-8">
                    <Badge tone="gray">Yuborilgan: {fmtDateTime(s.submitted_at)}</Badge>
                    {s.is_late && <Badge tone="amber">Kech topshirilgan</Badge>}
                    {s.attempt > 1 && <Badge tone="blue">{s.attempt}-urinish</Badge>}
                  </div>
                  {s.comment && <div className="row-top gap-8 mt-12" style={{ background: "var(--surface-2)", padding: 12, borderRadius: 12 }}><MessageSquareText size={18} style={{ flexShrink: 0, color: "var(--primary)" }} /><div className="pre small">{s.comment}</div></div>}
                </Card>
                <Card title={`Yuborilgan fayllar (${s.files.length})`}><FileGallery files={s.files} /></Card>
              </div>
              <div className="col gap-16">
                <Card title={s.status === "submitted" ? "Baholash" : "Bahoni o'zgartirish"}>
                  <div className="col gap-16">
                    {s.status !== "submitted" && <Alert tone={s.status === "accepted" ? "success" : "warn"}>{s.status === "accepted" ? `Qabul qilingan: ${s.score}/${max}` : "Qayta ishlashga qaytarilgan, o'quvchi javobini kutmoqda"}</Alert>}
                    {err && <Alert tone="error">{err.message}</Alert>}
                    <Field label={`Baho (${max} ballik)`} error={err?.field("score")}>
                      {options.length ? (
                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(options.length, 6)}, 1fr)`, gap: 8 }}>
                          {options.map((o) => (
                            <button key={o} type="button" onClick={() => setScore(o)} className="btn" style={{
                              minHeight: 52, fontSize: 18, fontWeight: 750, padding: 0,
                              background: score === o ? "var(--grad)" : "var(--surface-2)", color: score === o ? "#fff" : "var(--text)",
                            }}>{o}</button>
                          ))}
                        </div>
                      ) : <Input type="number" inputMode="numeric" min={0} max={max} value={score ?? ""} onChange={(e) => setScore(e.target.value === "" ? null : Number(e.target.value))} />}
                    </Field>
                    <Field label="Izoh" error={err?.field("feedback")} help="Qayta ishlashga qaytarishda izoh majburiy">
                      <Textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Yaxshi bajarilgan! / 3-misolda xato bor…" />
                    </Field>
                    <div className="grid-2">
                      <Button variant="secondary" icon={<RotateCcw />} loading={busy === "revision"} disabled={!!busy || !feedback.trim()} onClick={() => review("revision")}>Qaytarish</Button>
                      <Button variant="success" icon={<Check />} loading={busy === "accept"} disabled={!!busy || score === null} onClick={() => review("accept")}>Qabul qilish</Button>
                    </div>
                    {next && <Button variant="ghost" icon={<ChevronRight />} onClick={() => nav(`/t/review/${next}`)}>Keyingi ishga o'tish</Button>}
                  </div>
                </Card>
                <Card title="Tarix"><SubmissionTimeline s={s} /></Card>
              </div>
            </div>
          );
        }}
      </Loader>
    </Page>
  );
}
