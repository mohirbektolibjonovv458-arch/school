import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarClock, ChevronRight, Lock, LockOpen, Pencil, Star, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { dueIn, fmtDateTime, relative } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { FileInfo, HomeworkDetail, HomeworkItem, HwState } from "../../lib/types";
import { Avatar, Badge, Button, Card, FileGallery, HwBadge, Loader, Ring, Segment, SubjectIcon, useConfirm } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

interface Row { student: { id: number; full_name: string }; state: HwState; submission: { id: number; status: string; score: number | null; submitted_at: string; is_late: boolean; attempt: number; file_count: number } | null }

export default function TeacherHomeworkDetail({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const hw = useApi<HomeworkDetail>(`homework/${id}/`);
  const subs = useApi<{ homework: HomeworkItem; rows: Row[] }>(`homework/${id}/submissions/`);
  const [filter, setFilter] = useState<"all" | "submitted" | "missing" | "accepted">("all");
  const { confirm, el } = useConfirm();

  const toggleClose = async (h: HomeworkDetail) => {
    hw.setData(await api(`homework/${id}/`, { method: "PATCH", body: { is_closed: !h.is_closed } }));
    toast(h.is_closed ? "Vazifa qayta ochildi" : "Vazifa yopildi — endi topshirib bo'lmaydi");
  };
  const del = async () => {
    if (!(await confirm("Vazifani o'chirasizmi?", { text: "O'quvchilar yuborgan barcha ishlar ham o'chadi. Bu amalni qaytarib bo'lmaydi.", danger: true, ok: "O'chirish" }))) return;
    await api(`homework/${id}/`, { method: "DELETE" });
    toast("Vazifa o'chirildi");
    nav(readOnly ? "/d/homework" : "/t/homework", { replace: true });
  };
  const removeFile = async (f: FileInfo) => {
    if (!(await confirm(`«${f.name}» o'chirilsinmi?`, { danger: true, ok: "O'chirish" }))) return;
    hw.setData(await api(`homework/${id}/files/${f.id}/`, { method: "DELETE" }));
  };

  return (
    <Page title="Vazifa" back={readOnly ? "/d/homework" : "/t/homework"}>
      <Loader state={hw}>
        {(h) => {
          const rows = subs.data?.rows || [];
          const n = rows.length;
          const submitted = rows.filter((r) => r.submission).length;
          const toReview = rows.filter((r) => r.state === "submitted").length;
          const accepted = rows.filter((r) => r.state === "accepted").length;
          const scores = rows.map((r) => r.submission?.score).filter((x): x is number => x !== null && x !== undefined);
          const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
          const due = dueIn(h.due_at);
          const filtered = rows.filter((r) => filter === "all" || (filter === "submitted" ? r.state === "submitted" : filter === "accepted" ? r.state === "accepted" : !r.submission));
          return (
            <div className="split">
              <div className="col gap-16">
                <Card>
                  <div className="row gap-12">
                    <SubjectIcon icon={h.subject.icon} color={h.subject.color} size={48} />
                    <div className="grow"><div className="small bold" style={{ color: h.subject.color }}>{h.school_class.name} sinf · {h.subject.name}</div><div className="tiny subtle">{h.teacher_name} · {relative(h.created_at)}</div></div>
                    {h.is_closed && <Badge tone="gray" icon={<Lock />}>Yopilgan</Badge>}
                  </div>
                  <h1 className="h2 mt-12">{h.title}</h1>
                  <div className="row wrap gap-8 mt-12">
                    <Badge tone={due.overdue ? "gray" : due.tone} icon={<CalendarClock />}>{fmtDateTime(h.due_at)}</Badge>
                    {!due.overdue && !h.is_closed && <Badge tone={due.tone}>{due.text}</Badge>}
                    <Badge tone="gray" icon={<Star />}>{h.max_score} ballik</Badge>
                    {h.allow_late && <Badge tone="blue">Kech topshirish mumkin</Badge>}
                  </div>
                  {h.description && <p className="pre mt-12 muted">{h.description}</p>}
                  {h.files.length > 0 && <div className="mt-16"><FileGallery files={h.files} onRemove={h.can_edit && !readOnly ? removeFile : undefined} /></div>}
                  {h.can_edit && (
                    <div className="row wrap gap-8 mt-16">
                      {!readOnly && <Button size="sm" variant="secondary" icon={<Pencil />} onClick={() => nav(`/t/homework/${id}/edit`)}>Tahrirlash</Button>}
                      {!readOnly && <Button size="sm" variant="secondary" icon={h.is_closed ? <LockOpen /> : <Lock />} onClick={() => toggleClose(h)}>{h.is_closed ? "Qayta ochish" : "Yopish"}</Button>}
                      <Button size="sm" variant="danger-soft" icon={<Trash2 />} onClick={del}>O'chirish</Button>
                    </div>
                  )}
                </Card>
                <div className="card row gap-16 wrap">
                  <Ring value={n ? (submitted / n) * 100 : 0} size={76} />
                  <div className="grid-2 grow" style={{ gap: 8 }}>
                    <div><div className="tiny subtle">Topshirdi</div><div className="h3 num">{submitted}/{n}</div></div>
                    <div><div className="tiny subtle">Tekshirish kerak</div><div className="h3 num" style={{ color: toReview ? "var(--amber)" : undefined }}>{toReview}</div></div>
                    <div><div className="tiny subtle">Qabul qilingan</div><div className="h3 num">{accepted}</div></div>
                    <div><div className="tiny subtle">O'rtacha ball</div><div className="h3 num">{avg}</div></div>
                  </div>
                </div>
              </div>
              <div className="col gap-12">
                <Segment value={filter} onChange={setFilter} items={[
                  { value: "all", label: "Hammasi" }, { value: "submitted", label: "Tekshirish", count: toReview },
                  { value: "missing", label: "Topshirmagan", count: n - submitted }, { value: "accepted", label: "Baholangan" },
                ]} />
                <div className="card pad-0">
                  {filtered.length === 0 && <div className="small subtle" style={{ padding: 20, textAlign: "center" }}>Ro'yxat bo'sh</div>}
                  {filtered.map((r) => {
                    const body = (
                      <>
                        <Avatar name={r.student.full_name} size={40} />
                        <div className="grow">
                          <div className="bold small ellipsis">{r.student.full_name}</div>
                          <div className="row wrap gap-6 mt-4">
                            <HwBadge state={r.state} />
                            {r.submission?.is_late && <Badge tone="amber">Kech</Badge>}
                            {r.submission && <span className="tiny subtle">{relative(r.submission.submitted_at)}</span>}
                          </div>
                        </div>
                        {r.submission?.score !== null && r.submission?.score !== undefined && <b className="num" style={{ fontSize: 18 }}>{r.submission.score}</b>}
                        {r.submission && <ChevronRight className="chev" size={20} />}
                      </>
                    );
                    return r.submission && !readOnly ? <Link key={r.student.id} to={`/t/review/${r.submission.id}`} className="list-item">{body}</Link> : <div key={r.student.id} className="list-item">{body}</div>;
                  })}
                </div>
              </div>
            </div>
          );
        }}
      </Loader>
      {el}
    </Page>
  );
}
