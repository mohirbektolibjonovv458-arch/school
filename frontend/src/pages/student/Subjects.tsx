import { useState } from "react";
import { BookOpen, Phone, UsersRound } from "lucide-react";
import { useApi } from "../../lib/hooks";
import { Avatar, Badge, Empty, ListSkeleton, Loader, Progress, Segment, SubjectIcon } from "../../ui";
import { Page } from "../../ui/Shell";

interface SubjectRow { id: number; name: string; color: string; icon: string; teacher: { id: number; full_name: string; phone: string; avatar_url: string | null } | null; lessons_per_week: number; homework_total: number; homework_done: number; average: number | null; grades: number }
interface TeacherRow { id: number; full_name: string; phone: string; position: string; avatar_url: string | null; subjects: { name: string; color: string }[]; is_homeroom: boolean }

export default function Subjects() {
  const [tab, setTab] = useState<"subjects" | "teachers">("subjects");
  const subjects = useApi<SubjectRow[]>("my/subjects/");
  const teachers = useApi<TeacherRow[]>(tab === "teachers" ? "my/teachers/" : null);
  return (
    <Page title="Fanlar">
      <div className="col gap-12" style={{ maxWidth: 900, margin: "0 auto" }}>
        <Segment value={tab} onChange={setTab} items={[{ value: "subjects", label: "Fanlar" }, { value: "teachers", label: "O'qituvchilar" }]} />
        {tab === "subjects" ? (
          <Loader state={subjects} skeleton={<ListSkeleton />} empty={(d) => d.length === 0 ? <Empty icon={<BookOpen />} title="Fanlar hali biriktirilmagan" /> : null}>
            {(d) => (
              <div className="grid-auto">
                {d.map((s) => (
                  <div key={s.id} className="card col gap-12">
                    <div className="row gap-12">
                      <SubjectIcon icon={s.icon} color={s.color} />
                      <div className="grow"><div className="bold">{s.name}</div><div className="small muted ellipsis">{s.teacher?.full_name || "O'qituvchi biriktirilmagan"}</div></div>
                      {s.average !== null && <Badge tone={s.average >= 4.5 ? "green" : s.average >= 3.5 ? "blue" : "amber"}>{s.average}</Badge>}
                    </div>
                    <div className="row between small"><span className="muted">Haftada</span><b>{s.lessons_per_week} ta dars</b></div>
                    <div>
                      <div className="row between small" style={{ marginBottom: 6 }}><span className="muted">Vazifalar</span><b>{s.homework_done}/{s.homework_total}</b></div>
                      <Progress value={s.homework_total ? (s.homework_done / s.homework_total) * 100 : 0} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Loader>
        ) : (
          <Loader state={teachers} skeleton={<ListSkeleton />} empty={(d) => d.length === 0 ? <Empty icon={<UsersRound />} title="O'qituvchilar ro'yxati bo'sh" /> : null}>
            {(d) => (
              <div className="card pad-0">
                {d.map((t) => (
                  <div key={t.id} className="list-item">
                    <Avatar name={t.full_name} url={t.avatar_url} size={46} />
                    <div className="grow">
                      <div className="bold ellipsis">{t.full_name}</div>
                      <div className="row wrap gap-4 mt-4">
                        {t.is_homeroom && <Badge tone="primary">Sinf rahbari</Badge>}
                        {t.subjects.map((s) => <Badge key={s.name} tone="gray">{s.name}</Badge>)}
                      </div>
                    </div>
                    {t.phone && <a className="icon-btn" href={`tel:${t.phone}`} aria-label="Qo'ng'iroq"><Phone /></a>}
                  </div>
                ))}
              </div>
            )}
          </Loader>
        )}
      </div>
    </Page>
  );
}
