import { Link } from "react-router-dom";
import { BookOpen, CalendarDays, ChevronRight, ClipboardCheck, PartyPopper, Star } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { fmtDate, greeting, WEEKDAYS, isoWeekday } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { Announcement, EventT, HomeworkItem, Lesson } from "../../lib/types";
import { Empty, Loader, Ring, SectionTitle, Stat } from "../../ui";
import { Page } from "../../ui/Shell";
import { AnnouncementCard } from "../common/Announcements";
import { LessonCard } from "../common/Schedule";
import { HomeworkRow } from "./Homework";
import { EVENT_KIND } from "../common/Calendar";

interface D {
  class_name: string | null; lessons: Lesson[]; todo: HomeworkItem[]; average: number | null;
  counts: Record<string, number>; announcements: Announcement[]; events: EventT[];
}

export default function StudentHome() {
  const { user } = useAuth();
  const state = useApi<D>("dashboard/");
  return (
    <Page title="Bosh sahifa">
      <Loader state={state}>
        {(d) => {
          const now = d.lessons.find((l) => l.state === "now") || d.lessons.find((l) => l.state === "next");
          const todoCount = (d.counts.pending || 0) + (d.counts.revision || 0) + (d.counts.overdue || 0);
          return (
            <div className="split">
              <div className="col gap-16">
                <div className="hero">
                  <div className="small muted">{WEEKDAYS[isoWeekday()]}, {fmtDate(new Date())}</div>
                  <div className="h1 mt-4">{greeting()}, {user?.first_name}!</div>
                  <div className="muted mt-4">{d.class_name ? `${d.class_name} sinf` : "Sinf biriktirilmagan"} · bugun {d.lessons.length} ta dars</div>
                  {now && (
                    <div className="mt-16" style={{ background: "rgba(255,255,255,.16)", borderRadius: 16, padding: "12px 14px", position: "relative", zIndex: 1 }}>
                      <div className="tiny bold" style={{ opacity: 0.85 }}>{now.state === "now" ? "HOZIR" : "KEYINGI DARS"} · {now.start}–{now.end}</div>
                      <div className="h3 mt-4">{now.subject_name}</div>
                      <div className="small" style={{ opacity: 0.85 }}>{now.teacher_name}{now.room ? ` · ${now.room}-xona` : ""}</div>
                    </div>
                  )}
                </div>

                <div className="grid-2">
                  <Link to="/s/homework"><Stat label="Bajarish kerak" value={todoCount} icon={<ClipboardCheck />} tone={todoCount ? "amber" : "green"} hint={d.counts.revision ? `${d.counts.revision} tasi qayta ishlash` : "uy vazifalari"} /></Link>
                  <Link to="/s/grades" className="stat">
                    <div className="label"><span className="stat-icon tone-green"><Star /></span><span className="ellipsis">O'rtacha baho</span></div>
                    <div className="row gap-8" style={{ marginTop: 4 }}>
                      <div className="value">{d.average ?? "—"}</div>
                      {d.average !== null && <Ring value={(d.average / 5) * 100} size={34} stroke={5} color="var(--green)" label={<span />} />}
                    </div>
                    <div className="hint">{d.counts.accepted || 0} ta baholangan</div>
                  </Link>
                </div>

                <div>
                  <SectionTitle title="Bajarilishi kerak" action={<Link to="/s/homework" className="link">Barchasi</Link>} />
                  {d.todo.length === 0 ? (
                    <div className="card"><Empty icon={<PartyPopper />} title="Hammasi bajarilgan!" text="Yangi vazifa berilsa, bildirishnoma keladi" /></div>
                  ) : (
                    <div className="card pad-0">{d.todo.map((h) => <HomeworkRow key={h.id} h={h} />)}</div>
                  )}
                </div>

                <div>
                  <SectionTitle title="Bugungi darslar" action={<Link to="/s/schedule" className="link">Jadval</Link>} />
                  {d.lessons.length === 0 ? <div className="card"><Empty icon={<CalendarDays />} title="Bugun dars yo'q" /></div> : (
                    <div className="col gap-8">{d.lessons.map((l) => <LessonCard key={l.id} l={l} />)}</div>
                  )}
                </div>
              </div>

              <div className="col gap-16">
                <div className="grid-2">
                  <Link to="/s/subjects" className="card hover row gap-12"><div className="stat-icon tone-blue"><BookOpen /></div><div className="bold small">Fanlar va o'qituvchilar</div></Link>
                  <Link to="/calendar" className="card hover row gap-12"><div className="stat-icon tone-green"><CalendarDays /></div><div className="bold small">Taqvim</div></Link>
                </div>
                {d.events.length > 0 && (
                  <div>
                    <SectionTitle title="Yaqin tadbirlar" />
                    <div className="card pad-0">
                      {d.events.map((e) => (
                        <Link key={e.id} to="/calendar" className="list-item">
                          <div className="stat-icon" style={{ background: `color-mix(in srgb, ${EVENT_KIND[e.kind]?.color} 14%, transparent)`, color: EVENT_KIND[e.kind]?.color }}><CalendarDays /></div>
                          <div className="grow"><div className="bold small ellipsis">{e.title}</div><div className="tiny subtle">{fmtDate(e.starts_at)} · {EVENT_KIND[e.kind]?.label}</div></div>
                          <ChevronRight className="chev" size={18} />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <SectionTitle title="So'nggi e'lonlar" action={<Link to="/announcements" className="link">Barchasi</Link>} />
                  {d.announcements.length === 0 ? <div className="card small subtle">E'lonlar yo'q</div> : <div className="col gap-12">{d.announcements.map((a) => <AnnouncementCard key={a.id} a={a} />)}</div>}
                </div>
              </div>
            </div>
          );
        }}
      </Loader>
    </Page>
  );
}

