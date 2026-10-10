import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ClipboardCheck, Paperclip } from "lucide-react";
import { qs } from "../../lib/api";
import { dueIn } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { HomeworkItem, Paged } from "../../lib/types";
import { Badge, Empty, HwBadge, ListSkeleton, Loader, Segment, SubjectIcon } from "../../ui";
import { Page } from "../../ui/Shell";

export function HomeworkRow({ h }: { h: HomeworkItem }) {
  const st = h.my?.state || "pending";
  const due = dueIn(h.due_at);
  const showDue = st === "pending" || st === "revision" || st === "overdue";
  return (
    <Link to={`/s/homework/${h.id}`} className="list-item">
      <SubjectIcon icon={h.subject.icon} color={h.subject.color} />
      <div className="grow">
        <div className="tiny bold" style={{ color: h.subject.color }}>{h.subject.name}</div>
        <div className="bold ellipsis">{h.title}</div>
        <div className="row wrap gap-6 mt-4">
          {showDue ? <Badge tone={due.tone}>{due.text}</Badge> : <HwBadge state={st} />}
          {st === "accepted" && h.my?.score !== null && <Badge tone="green">{h.my?.score}/{h.max_score}</Badge>}
          {st === "revision" && <HwBadge state="revision" />}
          {!!h.file_count && <span className="tiny subtle row gap-4"><Paperclip size={12} />{h.file_count}</span>}
        </div>
      </div>
      <ChevronRight className="chev" size={20} />
    </Link>
  );
}

const TABS = [
  { value: "active", label: "Bajarish kerak" },
  { value: "submitted", label: "Tekshiruvda" },
  { value: "graded", label: "Baholangan" },
  { value: "missed", label: "O'tib ketgan" },
] as const;

export default function StudentHomework() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("active");
  const state = useApi<Paged<HomeworkItem>>(`homework/${qs({ state: tab, page_size: 100 })}`);
  const empty: Record<string, string> = {
    active: "Barcha vazifalar bajarilgan 🎉", submitted: "Tekshirilayotgan ishlar yo'q", graded: "Hali baholangan ishlar yo'q", missed: "O'tkazib yuborilgan vazifa yo'q 👍",
  };
  return (
    <Page title="Uy vazifalari">
      <div className="col gap-12" style={{ maxWidth: 800, margin: "0 auto" }}>
        <Segment value={tab} onChange={setTab} items={TABS.map((t) => ({ ...t, count: tab === t.value ? state.data?.count : undefined }))} />
        <Loader state={state} skeleton={<ListSkeleton rows={5} />}
          empty={(d) => d.results.length === 0 ? <div className="card"><Empty icon={<ClipboardCheck />} title={empty[tab]} /></div> : null}>
          {(d) => (
            <div className="card pad-0">
              {d.results.map((h) => <HomeworkRow key={h.id} h={h} />)}
            </div>
          )}
        </Loader>
        {tab === "missed" && <p className="tiny subtle" style={{ textAlign: "center" }}>Muddati o'tgan, lekin o'qituvchi kech topshirishga ruxsat bergan vazifalar «Bajarish kerak» bo'limida qoladi.</p>}
      </div>
    </Page>
  );
}

