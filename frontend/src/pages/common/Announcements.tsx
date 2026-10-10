import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Megaphone, Paperclip, Pin, Plus, Send } from "lucide-react";
import { qs } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { relative } from "../../lib/format";
import { useApi, useDebounced } from "../../lib/hooks";
import type { Announcement, Paged } from "../../lib/types";
import { Avatar, Badge, Empty, ListSkeleton, Loader, SearchInput } from "../../ui";
import { Page } from "../../ui/Shell";
import AnnouncementForm, { AUDIENCES } from "./AnnouncementForm";

export function AnnouncementCard({ a }: { a: Announcement }) {
  const aud = a.audience === "classes" ? a.class_names.join(", ") : AUDIENCES.find((x) => x.value === a.audience)?.label;
  return (
    <Link to={`/announcements/${a.id}`} className="card hover col gap-8" style={a.important ? { borderColor: "color-mix(in srgb, var(--red) 40%, var(--border))" } : undefined}>
      <div className="row gap-8">
        <Avatar name={a.author?.full_name || "Maktab"} url={a.author?.avatar_url} size={36} />
        <div className="grow">
          <div className="small bold ellipsis">{a.author?.full_name || "Maktab ma'muriyati"}</div>
          <div className="tiny subtle">{relative(a.created_at)} · {aud}</div>
        </div>
        {a.pinned && <Pin size={16} style={{ color: "var(--primary)" }} />}
      </div>
      <div className="row-top gap-8">
        {a.important && <AlertCircle size={18} style={{ color: "var(--red)", marginTop: 2, flexShrink: 0 }} />}
        <div className="h3">{a.title}</div>
      </div>
      <div className="muted small clamp-2 pre">{a.body}</div>
      {(a.attachment_url || a.source === "telegram") && (
        <div className="row gap-8">
          {a.attachment_url && <Badge tone="gray" icon={<Paperclip />}>{a.attachment_name || "Ilova"}</Badge>}
          {a.source === "telegram" && <Badge tone="blue" icon={<Send />}>Telegram orqali</Badge>}
        </div>
      )}
    </Link>
  );
}

export default function Announcements() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [open, setOpen] = useState(false);
  const state = useApi<Paged<Announcement>>(`announcements/${qs({ q: dq, page_size: 50 })}`);
  const canPost = user?.role !== "student";
  return (
    <Page title="E'lonlar">
      <div style={{ maxWidth: 760, margin: "0 auto" }} className="col gap-12">
        <SearchInput value={q} onChange={setQ} placeholder="E'lonlardan qidirish" />
        <Loader state={state} skeleton={<ListSkeleton rows={4} />}
          empty={(d) => d.results.length === 0 ? <Empty icon={<Megaphone />} title={dq ? "Hech narsa topilmadi" : "Hozircha e'lonlar yo'q"} text={canPost && !dq ? "Birinchi e'lonni joylang — u tegishli odamlarga bildirishnoma bo'lib boradi" : undefined} /> : null}>
          {(d) => <div className="col gap-12">{d.results.map((a) => <AnnouncementCard key={a.id} a={a} />)}</div>}
        </Loader>
      </div>
      {canPost && <button className="fab" onClick={() => setOpen(true)}><Plus />E'lon</button>}
      <AnnouncementForm open={open} onClose={() => setOpen(false)} onSaved={() => state.reload(true)} />
    </Page>
  );
}
