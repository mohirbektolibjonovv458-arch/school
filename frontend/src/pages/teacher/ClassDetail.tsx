import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ClipboardCheck, Phone, Plus, Users } from "lucide-react";
import { useApi } from "../../lib/hooks";
import type { Assignment, HomeworkItem, Lesson, SchoolClass, Student } from "../../lib/types";
import { Avatar, Badge, Button, Empty, Loader, SearchInput, Segment, Stat } from "../../ui";
import { Page } from "../../ui/Shell";
import { TeacherHomeworkRow } from "./Homework";

export interface ClassOverview {
  class: SchoolClass; students: Student[]; assignments: Assignment[]; lessons: Lesson[]; homework: HomeworkItem[];
  stats: { students: number; teachers: number; homework: number; submission_rate: number | null };
}

export function StudentList({ students }: { students: Student[] }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => students.filter((s) => s.full_name.toLowerCase().includes(q.toLowerCase())), [students, q]);
  if (!students.length) return <Empty icon={<Users />} title="Sinfda o'quvchilar yo'q" />;
  return (
    <div className="col gap-12">
      {students.length > 8 && <SearchInput value={q} onChange={setQ} placeholder="O'quvchini qidirish" />}
      <div className="card pad-0">
        {list.map((s, i) => (
          <div key={s.id} className="list-item">
            <span className="tiny subtle num" style={{ width: 20 }}>{i + 1}</span>
            <Avatar name={s.full_name} url={s.avatar_url} size={40} />
            <div className="grow"><div className="bold small ellipsis">{s.full_name}</div><div className="tiny subtle">{s.parent_name ? `Ota-ona: ${s.parent_name}` : `ID: ${s.student_no}`}</div></div>
            {s.parent_phone && <a className="icon-btn" href={`tel:${s.parent_phone}`} aria-label="Ota-onaga qo'ng'iroq"><Phone /></a>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeacherClassDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState<"students" | "homework">("students");
  const state = useApi<ClassOverview>(`classes/${id}/overview/`);
  return (
    <Page title={state.data ? `${state.data.class.name} sinf` : "Sinf"} back="/t/classes">
      <Loader state={state}>
        {(d) => (
          <div className="col gap-16">
            <div className="grid-2 grid-3-md">
              <Stat label="O'quvchilar" value={d.stats.students} icon={<Users />} />
              <Stat label="Vazifalarim" value={d.homework.length} icon={<ClipboardCheck />} tone="blue" />
              <Stat label="Topshirish darajasi" value={d.stats.submission_rate !== null ? `${d.stats.submission_rate}%` : "—"} tone="green" icon={<ClipboardCheck />} />
            </div>
            <div className="row wrap gap-6">{d.assignments.map((a) => <Badge key={a.id} tone="primary">{a.subject_name} · {a.teacher_name}</Badge>)}</div>
            <div className="row between gap-8">
              <Segment value={tab} onChange={setTab} items={[{ value: "students", label: "O'quvchilar" }, { value: "homework", label: "Vazifalar" }]} />
              <Button size="sm" icon={<Plus />} onClick={() => nav(`/t/homework/new?class=${d.class.id}`)}>Vazifa</Button>
            </div>
            {tab === "students" ? <StudentList students={d.students} /> : d.homework.length === 0 ? <Empty icon={<ClipboardCheck />} title="Bu sinfga hali vazifa bermagansiz" /> : (
              <div className="card pad-0">{d.homework.map((h) => <TeacherHomeworkRow key={h.id} h={h} />)}</div>
            )}
          </div>
        )}
      </Loader>
    </Page>
  );
}
