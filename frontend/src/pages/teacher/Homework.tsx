import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ClipboardCheck, Plus } from "lucide-react";
import { qs } from "../../lib/api";
import { dueIn, fmtDateTime } from "../../lib/format";
import { useApi, useDebounced } from "../../lib/hooks";
import type { HomeworkItem, Paged, SchoolClass } from "../../lib/types";
import { Badge, Empty, ListSkeleton, Loader, SearchInput, Segment, Select, SubjectIcon } from "../../ui";
import { Page } from "../../ui/Shell";

export function TeacherHomeworkRow({ h, base = "/t/homework" }: { h: HomeworkItem; base?: string }) {
  const due = dueIn(h.due_at);
  const s = h.stats;
  const pct = s && s.students ? Math.round((s.submitted / s.students) * 100) : 0;
  return (
    <Link to={`${base}/${h.id}`} className="list-item">
      <SubjectIcon icon={h.subject.icon} color={h.subject.color} />
      <div className="grow">
        <div className="tiny bold" style={{ color: h.subject.color }}>{h.school_class.name} · {h.subject.name}</div>
        <div className="bold ellipsis">{h.title}</div>
        <div className="row wrap gap-6 mt-4">
          {h.is_closed ? <Badge tone="gray">Yopilgan</Badge> : due.overdue ? <Badge tone="gray">{fmtDateTime(h.due_at)}</Badge> : <Badge tone={due.tone}>{due.text}</Badge>}
          {s && <span className="tiny subtle">{s.submitted}/{s.students ?? "?"} topshirdi · {pct}%</span>}
          {!!s?.to_review && <Badge tone="amber">{s.to_review} tekshirish</Badge>}
        </div>
      </div>
      <ChevronRight className="chev" size={20} />
    </Link>
  );
}

export default function TeacherHomework() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as "active" | "review" | "past" | "all") || "active";
  const [cls, setCls] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const classes = useApi<SchoolClass[]>("classes/");
  const state = useApi<Paged<HomeworkItem>>(`homework/${qs({ status: status === "all" ? "" : status, class: cls, q: dq, page_size: 100 })}`);
  return (
    <Page title="Uy vazifalari">
      <div className="col gap-12" style={{ maxWidth: 900, margin: "0 auto" }}>
        <Segment value={status} onChange={(v) => setParams({ status: v }, { replace: true })} items={[
          { value: "active", label: "Faol" }, { value: "review", label: "Tekshirish" }, { value: "past", label: "Tugagan" }, { value: "all", label: "Hammasi" },
        ]} />
        <div className="row gap-8">
          <div className="grow"><SearchInput value={q} onChange={setQ} /></div>
          <Select value={cls} onChange={(e) => setCls(e.target.value)} style={{ width: 130, flexShrink: 0 }}>
            <option value="">Sinflar</option>
            {(classes.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <Loader state={state} skeleton={<ListSkeleton />}
          empty={(d) => d.results.length === 0 ? <div className="card"><Empty icon={<ClipboardCheck />} title={status === "review" ? "Tekshiriladigan ish yo'q" : "Vazifalar topilmadi"} text={status === "active" ? "«Vazifa berish» tugmasi orqali sinfingizga uy vazifasi joylang" : undefined} /></div> : null}>
          {(d) => <div className="card pad-0">{d.results.map((h) => <TeacherHomeworkRow key={h.id} h={h} />)}</div>}
        </Loader>
      </div>
      <button className="fab" onClick={() => nav("/t/homework/new")}><Plus />Vazifa berish</button>
    </Page>
  );
}
