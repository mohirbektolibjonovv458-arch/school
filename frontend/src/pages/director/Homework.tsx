import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { qs } from "../../lib/api";
import { useApi, useDebounced } from "../../lib/hooks";
import type { HomeworkItem, Paged, SchoolClass } from "../../lib/types";
import { Empty, ListSkeleton, Loader, SearchInput, Segment, Select } from "../../ui";
import { Page } from "../../ui/Shell";
import { TeacherHomeworkRow } from "../teacher/Homework";

export default function DirectorHomework() {
  const [status, setStatus] = useState<"active" | "review" | "past" | "all">("active");
  const [cls, setCls] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const classes = useApi<SchoolClass[]>("classes/");
  const state = useApi<Paged<HomeworkItem>>(`homework/${qs({ status: status === "all" ? "" : status, class: cls, q: dq, page_size: 100 })}`);
  return (
    <Page title="Uy vazifalari">
      <div className="col gap-12" style={{ maxWidth: 900, margin: "0 auto" }}>
        <Segment value={status} onChange={setStatus} items={[{ value: "active", label: "Faol" }, { value: "review", label: "Tekshirilmagan" }, { value: "past", label: "Tugagan" }, { value: "all", label: "Hammasi" }]} />
        <div className="row gap-8">
          <div className="grow"><SearchInput value={q} onChange={setQ} /></div>
          <Select value={cls} onChange={(e) => setCls(e.target.value)} style={{ width: 130, flexShrink: 0 }}><option value="">Sinflar</option>{(classes.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </div>
        <Loader state={state} skeleton={<ListSkeleton />} empty={(d) => d.results.length === 0 ? <div className="card"><Empty icon={<ClipboardCheck />} title="Vazifalar topilmadi" /></div> : null}>
          {(d) => <><div className="small muted">{d.count} ta vazifa</div><div className="card pad-0">{d.results.map((h) => <TeacherHomeworkRow key={h.id} h={h} base="/d/homework" />)}</div></>}
        </Loader>
      </div>
    </Page>
  );
}
