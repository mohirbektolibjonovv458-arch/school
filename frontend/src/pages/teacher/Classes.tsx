import { Link } from "react-router-dom";
import { ChevronRight, School } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useApi } from "../../lib/hooks";
import type { SchoolClass } from "../../lib/types";
import { Badge, Empty, ListSkeleton, Loader } from "../../ui";
import { Page } from "../../ui/Shell";

export default function TeacherClasses() {
  const { user } = useAuth();
  const state = useApi<SchoolClass[]>("classes/");
  return (
    <Page title="Sinflarim">
      <Loader state={state} skeleton={<ListSkeleton />} empty={(d) => d.length === 0 ? <Empty icon={<School />} title="Sizga hali sinf biriktirilmagan" text="Direktor sizni sinf va fanga biriktirgach, shu yerda ko'rinadi" /> : null}>
        {(d) => (
          <div className="grid-auto">
            {d.map((c) => (
              <Link key={c.id} to={`/t/classes/${c.id}`} className="card hover row gap-12">
                <div style={{ width: 54, height: 54, borderRadius: 16, background: "var(--grad)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18 }}>{c.name}</div>
                <div className="grow">
                  <div className="h3">{c.name} sinf</div>
                  <div className="small muted">{c.student_count} o'quvchi{c.room ? ` · ${c.room}-xona` : ""}</div>
                  {c.homeroom_teacher_name && c.homeroom_teacher_name === user?.full_name && <Badge tone="primary">Sinf rahbari</Badge>}
                </div>
                <ChevronRight className="chev" />
              </Link>
            ))}
          </div>
        )}
      </Loader>
    </Page>
  );
}
