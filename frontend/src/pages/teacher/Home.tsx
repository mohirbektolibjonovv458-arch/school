import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, Inbox, Plus, ScanFace, Users } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { fmtDate, greeting, isoWeekday, relative, WEEKDAYS } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { Announcement, HomeworkItem, Lesson } from "../../lib/types";
import { Badge, Button, Empty, Loader, SectionTitle, Stat } from "../../ui";
import { Page } from "../../ui/Shell";
import { AnnouncementCard } from "../common/Announcements";
import { LessonCard } from "../common/Schedule";
import { TeacherHomeworkRow } from "./Homework";

interface D {
  lessons: Lesson[]; attendance: { check_in: string | null; check_out: string | null; late_minutes: number };
  to_review_count: number; to_review: { id: number; student: string; title: string; class_name: string; subject: string; color: string; submitted_at: string; is_late: boolean; attempt: number }[];
  active_homework: HomeworkItem[]; stats: { classes: number; students: number; homework: number; lessons_week: number }; announcements: Announcement[];
}

export default function TeacherHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const state = useApi<D>("dashboard/");
  return (
    <Page title="Bosh sahifa">
      <Loader state={state}>
        {(d) => (
          <div className="split">
            <div className="col gap-16">
              <div className="hero">
                <div className="small muted">{WEEKDAYS[isoWeekday()]}, {fmtDate(new Date())}</div>
                <div className="h1 mt-4">{greeting()}, {user?.first_name}!</div>
                <div className="row wrap gap-8 mt-12" style={{ position: "relative", zIndex: 1 }}>
                  <span className="badge" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>
                    <Clock3 />{d.attendance.check_in ? `Kelgan: ${d.attendance.check_in}` : "Bugun hali belgilanmagansiz"}
                  </span>
                  {d.attendance.late_minutes > 0 && <span className="badge" style={{ background: "rgba(251,191,36,.25)", color: "#fff" }}>{d.attendance.late_minutes} daq. kechikish</span>}
                  {d.attendance.check_out && <span className="badge" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>Ketgan: {d.attendance.check_out}</span>}
                </div>
                <div className="row gap-8 mt-16" style={{ position: "relative", zIndex: 1 }}>
                  <Button size="sm" style={{ background: "#fff", color: "#4338ca" }} icon={<Plus />} onClick={() => nav("/t/homework/new")}>Vazifa berish</Button>
                  <Button size="sm" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }} icon={<ScanFace />} onClick={() => nav("/t/face")}>Yuz orqali kirish</Button>
                </div>
              </div>

              <div className="grid-2 grid-4-md">
                <Link to="/t/homework?status=review"><Stat label="Tekshirish kerak" value={d.to_review_count} icon={<Inbox />} tone={d.to_review_count ? "amber" : "green"} /></Link>
                <Link to="/t/classes"><Stat label="Sinflarim" value={d.stats.classes} icon={<Users />} tone="primary" hint={`${d.stats.students} o'quvchi`} /></Link>
                <Stat label="Bugun darslar" value={d.lessons.length} icon={<CalendarDays />} tone="blue" hint={`haftada ${d.stats.lessons_week}`} />
                <Stat label="Jami vazifalar" value={d.stats.homework} icon={<ClipboardCheck />} tone="gray" />
              </div>

              <div>
                <SectionTitle title="Tekshirilishi kerak" action={d.to_review_count > 0 ? <Link to="/t/homework?status=review" className="link">Barchasi ({d.to_review_count})</Link> : null} />
                {d.to_review.length === 0 ? (
                  <div className="card"><Empty icon={<CheckCircle2 />} title="Hammasi tekshirilgan" text="O'quvchilar ish yuborganda shu yerda paydo bo'ladi" /></div>
                ) : (
                  <div className="card pad-0">
                    {d.to_review.map((s) => (
                      <Link key={s.id} to={`/t/review/${s.id}`} className="list-item">
                        <div className="stat-icon" style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color, width: 42, height: 42, borderRadius: 13 }}><ClipboardCheck /></div>
                        <div className="grow">
                          <div className="bold small ellipsis">{s.student}</div>
                          <div className="tiny muted ellipsis">{s.class_name} · {s.subject} · {s.title}</div>
                          <div className="row gap-6 mt-4"><span className="tiny subtle">{relative(s.submitted_at)}</span>{s.is_late && <Badge tone="amber">Kech</Badge>}{s.attempt > 1 && <Badge tone="blue">{s.attempt}-urinish</Badge>}</div>
                        </div>
                        <ChevronRight className="chev" size={20} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="col gap-16">
              <div>
                <SectionTitle title="Bugungi darslarim" action={<Link to="/t/schedule" className="link">Jadval</Link>} />
                {d.lessons.length === 0 ? <div className="card"><Empty icon={<CalendarDays />} title="Bugun darsingiz yo'q" /></div> : <div className="col gap-8">{d.lessons.map((l) => <LessonCard key={l.id} l={l} showClass />)}</div>}
              </div>
              <div>
                <SectionTitle title="Faol vazifalar" action={<Link to="/t/homework" className="link">Barchasi</Link>} />
                {d.active_homework.length === 0 ? <div className="card small subtle">Faol vazifa yo'q</div> : <div className="card pad-0">{d.active_homework.map((h) => <TeacherHomeworkRow key={h.id} h={h} />)}</div>}
              </div>
              {d.announcements.length > 0 && (
                <div>
                  <SectionTitle title="E'lonlar" action={<Link to="/announcements" className="link">Barchasi</Link>} />
                  <div className="col gap-12">{d.announcements.slice(0, 2).map((a) => <AnnouncementCard key={a.id} a={a} />)}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </Loader>
    </Page>
  );
}
