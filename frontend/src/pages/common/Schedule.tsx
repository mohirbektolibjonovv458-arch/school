import { useMemo, useState } from "react";
import { CalendarX2, DoorOpen } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { isoWeekday, WD_SHORT, WEEKDAYS } from "../../lib/format";
import { useApi, useDesktop } from "../../lib/hooks";
import type { Lesson } from "../../lib/types";
import { Badge, Empty, Loader, Skeleton } from "../../ui";
import { Page } from "../../ui/Shell";

export function LessonCard({ l, showClass, showTeacher = true }: { l: Lesson; showClass?: boolean; showTeacher?: boolean }) {
  return (
    <div className={`lesson ${l.state || ""}`}>
      <div className="time"><b>{l.start || `${l.period}`}</b><span>{l.end || "dars"}</span></div>
      <div className="bar" style={{ background: l.subject_color }} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="bold ellipsis">{l.subject_name}</div>
        <div className="small muted ellipsis">
          {showClass ? `${l.class_name} sinf` : showTeacher ? l.teacher_name || "O'qituvchi belgilanmagan" : ""}
          {l.room ? ` · ${l.room}-xona` : ""}
        </div>
        <div className="tiny subtle mt-4">{l.period}-dars</div>
      </div>
      {l.state === "now" && <span className="live"><Badge tone="green"><span className="pulse" />Hozir</Badge></span>}
      {l.state === "next" && <span className="live"><Badge tone="primary">Keyingi</Badge></span>}
    </div>
  );
}

export default function Schedule() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const state = useApi<Lesson[]>("lessons/");
  const desktop = useDesktop();
  const todayWd = Math.min(isoWeekday(), 6);
  const [day, setDay] = useState(todayWd);
  const byDay = useMemo(() => {
    const m: Record<number, Lesson[]> = {};
    for (const l of state.data || []) (m[l.weekday] ||= []).push(l);
    Object.values(m).forEach((arr) => arr.sort((a, b) => a.period - b.period));
    return m;
  }, [state.data]);
  const days = [1, 2, 3, 4, 5, 6];
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const withState = (l: Lesson): Lesson => {
    if (l.weekday !== isoWeekday() || !l.start || !l.end) return l;
    return { ...l, state: hm >= l.start && hm < l.end ? "now" : hm >= l.end ? "done" : "upcoming" };
  };

  return (
    <Page title="Dars jadvali">
      <Loader state={state} skeleton={<div className="col gap-8"><Skeleton h={60} r={16} /><Skeleton h={76} r={16} /><Skeleton h={76} r={16} /><Skeleton h={76} r={16} /></div>}
        empty={(d) => d.length === 0 ? <Empty icon={<CalendarX2 />} title="Jadval hali tuzilmagan" text="Maktab ma'muriyati dars jadvalini kiritganida shu yerda ko'rinadi" /> : null}>
        {() => desktop ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12 }}>
            {days.map((d) => (
              <div key={d} className="col gap-8">
                <div className={`bold small ${d === isoWeekday() ? "" : "muted"}`} style={{ padding: "4px 4px 2px", color: d === isoWeekday() ? "var(--primary)" : undefined }}>{WEEKDAYS[d]}</div>
                {(byDay[d] || []).map((l) => (
                  <div key={l.id} className="card" style={{ padding: 12, borderLeft: `4px solid ${l.subject_color}`, boxShadow: withState(l).state === "now" ? "0 0 0 3px var(--primary-soft)" : undefined }}>
                    <div className="tiny subtle num">{l.period}. {l.start}–{l.end}</div>
                    <div className="bold small mt-4">{l.subject_name}</div>
                    <div className="tiny muted">{isTeacher ? `${l.class_name} sinf` : l.teacher_name}{l.room ? ` · ${l.room}` : ""}</div>
                  </div>
                ))}
                {!(byDay[d] || []).length && <div className="tiny subtle" style={{ padding: 8 }}>Dars yo'q</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="col gap-12">
            <div className="chips">
              {days.map((d) => (
                <button key={d} className={`chip day-chip ${d === day ? "active" : ""} ${d === isoWeekday() ? "today" : ""}`} onClick={() => setDay(d)}>
                  <span className="w">{WD_SHORT[d]}</span><span className="d">{(byDay[d] || []).length}</span>
                </button>
              ))}
            </div>
            <div className="row between" style={{ marginTop: 4 }}>
              <h2 className="h3">{WEEKDAYS[day]}{day === isoWeekday() ? " · bugun" : ""}</h2>
              <span className="small subtle">{(byDay[day] || []).length} ta dars</span>
            </div>
            {(byDay[day] || []).length === 0 ? <Empty icon={<DoorOpen />} title="Bu kunda dars yo'q" /> : (
              <div className="col gap-8">{(byDay[day] || []).map((l) => <LessonCard key={l.id} l={withState(l)} showClass={isTeacher} />)}</div>
            )}
          </div>
        )}
      </Loader>
    </Page>
  );
}

