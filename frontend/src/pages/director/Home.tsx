import { Link, useNavigate } from "react-router-dom";
import { AlarmClock, BookOpen, Check, ChevronRight, ClipboardCheck, GraduationCap, Megaphone, ScanFace, School, Star, UserX, Users } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { fmtDate, greeting, isoWeekday, WD_SHORT, WEEKDAYS } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { Announcement } from "../../lib/types";
import { Alert, Avatar, Badge, Button, Card, Loader, Progress, Ring, SectionTitle, Stat, StackBars } from "../../ui";
import { Page } from "../../ui/Shell";
import { AnnouncementCard } from "../common/Announcements";

interface Brief { id: number; full_name: string; status: string; status_label: string; check_in: string | null; expected_at: string | null; late_minutes: number }
interface D {
  counts: { students: number; teachers: number; classes: number; subjects: number };
  attendance: { total: number; expected: number; present: number; late: number; absent: number; excused: number; pending: number; came: number; rate: number };
  late: Brief[]; absent: Brief[];
  week: { series: { date: string; present: number; late: number; absent: number; excused: number }[]; totals: { rate: number | null; punctuality: number | null; late_minutes: number } };
  homework: { created_week: number; submissions_week: number; to_review: number; average_score: number | null };
  classes: { id: number; name: string; students: number; homework: number; rate: number | null }[];
  pending_faces: number; setup: { key: string; label: string; done: boolean; link: string }[]; announcements: Announcement[]; work_start: string;
}

export default function DirectorHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const state = useApi<D>("dashboard/");
  return (
    <Page title="Boshqaruv paneli">
      <Loader state={state}>
        {(d) => {
          const a = d.attendance;
          const setupLeft = d.setup.filter((s) => !s.done);
          return (
            <div className="col gap-16">
              <div className="hero">
                <div className="row between gap-12" style={{ position: "relative", zIndex: 1, alignItems: "center" }}>
                  <div className="grow">
                    <div className="small muted">{WEEKDAYS[isoWeekday()]}, {fmtDate(new Date(), true)}</div>
                    <div className="h1 mt-4">{greeting()}, {user?.first_name || user?.full_name}!</div>
                    <div className="muted mt-4">Bugun {a.came} / {a.expected} o'qituvchi maktabda{a.late ? `, ${a.late} kishi kechikdi` : ""}</div>
                  </div>
                  <Ring value={a.rate} size={76} stroke={7} color="#fff" label={<div style={{ color: "#fff" }}><div className="bold num" style={{ fontSize: 17 }}>{Math.round(a.rate)}%</div><div className="tiny" style={{ opacity: 0.8, fontSize: 10 }}>davomat</div></div>} />
                </div>
              </div>

              {setupLeft.length > 0 && (
                <Card title={`Maktabni sozlash · ${d.setup.length - setupLeft.length}/${d.setup.length}`}>
                  <Progress value={((d.setup.length - setupLeft.length) / d.setup.length) * 100} />
                  <div className="tiny subtle mt-8">{d.setup.length - setupLeft.length} ta qadam bajarildi. Qolganlari:</div>
                  <div className="col gap-4 mt-8">
                    {setupLeft.map((s) => (
                      <Link key={s.key} to={s.link} className="row gap-12" style={{ padding: "8px 2px", opacity: s.done ? 0.55 : 1 }}>
                        <span style={{ width: 24, height: 24, borderRadius: 8, display: "grid", placeItems: "center", background: s.done ? "var(--green)" : "var(--surface-3)", color: "#fff", flexShrink: 0 }}>{s.done && <Check size={15} />}</span>
                        <span className={`grow small ${s.done ? "" : "bold"}`} style={{ textDecoration: s.done ? "line-through" : undefined }}>{s.label}</span>
                        {!s.done && <ChevronRight size={18} className="chev" />}
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
              {d.pending_faces > 0 && <Link to="/d/biometrics"><Alert tone="info" icon={<ScanFace />}><b>{d.pending_faces} ta yuz namunasi tasdiq kutmoqda</b> — ko'rib chiqish uchun bosing</Alert></Link>}

              <div className="grid-2 grid-4-md">
                <Stat label="Keldi" value={a.came} icon={<Check />} tone="green" hint={`${a.present} o'z vaqtida`} onClick={() => nav("/d/attendance")} />
                <Stat label="Kechikdi" value={a.late} icon={<AlarmClock />} tone="amber" hint={`ish boshi ${d.work_start}`} onClick={() => nav("/d/attendance?status=late")} />
                <Stat label="Kelmadi" value={a.absent} icon={<UserX />} tone="red" hint={`${a.excused} sababli · ${a.pending} kutilmoqda`} onClick={() => nav("/d/attendance?status=absent")} />
                <Stat label="Tekshirilmagan ishlar" value={d.homework.to_review} icon={<ClipboardCheck />} tone="blue" hint={`haftada ${d.homework.submissions_week} topshiriq`} onClick={() => nav("/d/homework")} />
              </div>

              <div className="split">
                <div className="col gap-16">
                  <Card title="Haftalik davomat" action={<Link to="/d/reports" className="link">Hisobotlar</Link>}>
                    <StackBars
                      data={d.week.series.map((s) => ({ label: WD_SHORT[isoWeekday(new Date(s.date + "T00:00"))], values: s }))}
                      keys={[{ key: "present", color: "var(--green)", label: "O'z vaqtida" }, { key: "late", color: "var(--amber)", label: "Kechikkan" }, { key: "absent", color: "var(--red)", label: "Kelmagan" }, { key: "excused", color: "var(--blue)", label: "Sababli" }]}
                    />
                    <div className="row wrap gap-8 mt-12">
                      <Badge tone="green">Davomat: {d.week.totals.rate ?? "—"}%</Badge>
                      <Badge tone="primary">O'z vaqtida: {d.week.totals.punctuality ?? "—"}%</Badge>
                      <Badge tone="amber">Kechikish: {d.week.totals.late_minutes} daq.</Badge>
                    </div>
                  </Card>
                  {(d.late.length > 0 || d.absent.length > 0) && (
                    <Card title="Bugun e'tibor talab qiladi" action={<Link to="/d/attendance" className="link">Davomat</Link>}>
                      <div className="col">
                        {[...d.late, ...d.absent].map((r) => (
                          <Link key={r.id} to={`/d/teachers/${r.id}`} className="row gap-12" style={{ padding: "8px 0" }}>
                            <Avatar name={r.full_name} size={36} />
                            <div className="grow"><div className="small bold ellipsis">{r.full_name}</div><div className="tiny subtle">{r.check_in ? `Keldi ${r.check_in} · +${r.late_minutes} daq.` : `Kutilgan ${r.expected_at || "—"}`}</div></div>
                            <Badge tone={r.status === "late" ? "amber" : "red"}>{r.status_label}</Badge>
                          </Link>
                        ))}
                      </div>
                    </Card>
                  )}
                  <Card title="Sinflar: vazifa bajarilishi (30 kun)" action={<Link to="/d/classes" className="link">Sinflar</Link>}>
                    {d.classes.length === 0 ? <div className="small subtle">Sinflar yo'q</div> : (
                      <div className="col gap-12">
                        {d.classes.map((c) => (
                          <Link key={c.id} to={`/d/classes/${c.id}`}>
                            <div className="row between small" style={{ marginBottom: 6 }}><b>{c.name}</b><span className="muted">{c.rate !== null ? `${c.rate}%` : "vazifa yo'q"} · {c.students} o'quvchi</span></div>
                            <Progress value={c.rate || 0} />
                          </Link>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
                <div className="col gap-16">
                  <div className="grid-2">
                    <Stat label="O'quvchilar" value={d.counts.students} icon={<Users />} onClick={() => nav("/d/students")} />
                    <Stat label="O'qituvchilar" value={d.counts.teachers} icon={<GraduationCap />} tone="blue" onClick={() => nav("/d/teachers")} />
                    <Stat label="Sinflar" value={d.counts.classes} icon={<School />} tone="green" onClick={() => nav("/d/classes")} />
                    <Stat label="O'rtacha baho" value={d.homework.average_score ?? "—"} icon={<Star />} tone="amber" hint={`${d.counts.subjects} fan`} />
                  </div>
                  <div className="grid-2">
                    <Button variant="secondary" icon={<Megaphone />} onClick={() => nav("/announcements")}>E'lon berish</Button>
                    <Button variant="secondary" icon={<BookOpen />} onClick={() => nav("/d/reports")}>Hisobot</Button>
                  </div>
                  <div>
                    <SectionTitle title="So'nggi e'lonlar" action={<Link to="/announcements" className="link">Barchasi</Link>} />
                    {d.announcements.length ? <div className="col gap-12">{d.announcements.slice(0, 2).map((x) => <AnnouncementCard key={x.id} a={x} />)}</div> : <div className="card small subtle">E'lonlar yo'q</div>}
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </Loader>
    </Page>
  );
}
