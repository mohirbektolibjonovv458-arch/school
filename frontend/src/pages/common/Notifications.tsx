import { useNavigate } from "react-router-dom";
import { AlarmClock, Bell, BookOpenCheck, CalendarDays, CheckCheck, ClipboardList, Megaphone, RotateCcw, ScanFace, Star, UserX, Users } from "lucide-react";
import { api } from "../../lib/api";
import { relative } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { Notif, Paged } from "../../lib/types";
import { Button, Empty, ListSkeleton, Loader } from "../../ui";
import { Page, useCounts } from "../../ui/Shell";

const KIND: Record<string, { icon: typeof Bell; tone: string }> = {
  homework: { icon: ClipboardList, tone: "primary" }, submission: { icon: BookOpenCheck, tone: "blue" }, graded: { icon: Star, tone: "green" },
  revision: { icon: RotateCcw, tone: "amber" }, deadline: { icon: AlarmClock, tone: "red" }, announcement: { icon: Megaphone, tone: "primary" },
  event: { icon: CalendarDays, tone: "blue" }, late: { icon: AlarmClock, tone: "amber" }, absent: { icon: UserX, tone: "red" },
  face: { icon: ScanFace, tone: "primary" }, assignment: { icon: Users, tone: "green" },
};

export default function Notifications() {
  const nav = useNavigate();
  const { refresh } = useCounts();
  const state = useApi<Paged<Notif>>("notifications/?page_size=100");
  const open = async (n: Notif) => {
    if (!n.read_at) {
      api(`notifications/${n.id}/read/`, { method: "POST" }).then(refresh).catch(() => {});
      state.setData((d) => d && { ...d, results: d.results.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) });
    }
    if (n.link) nav(n.link);
  };
  const readAll = async () => {
    await api("notifications/read-all/", { method: "POST" });
    state.reload(true);
    refresh();
  };
  const unread = state.data?.results.filter((n) => !n.read_at).length || 0;
  return (
    <Page title="Bildirishnomalar" back hideBell actions={unread > 0 ? <Button size="sm" variant="ghost" icon={<CheckCheck />} onClick={readAll}>Barchasi o'qildi</Button> : null}>
      <Loader state={state} skeleton={<ListSkeleton rows={7} />}
        empty={(d) => d.results.length === 0 ? <Empty icon={<Bell />} title="Bildirishnomalar yo'q" text="Yangi vazifalar, baholar va e'lonlar shu yerda paydo bo'ladi" /> : null}>
        {(d) => (
          <div className="card pad-0" style={{ maxWidth: 760, margin: "0 auto" }}>
            {d.results.map((n) => {
              const k = KIND[n.kind] || { icon: Bell, tone: "gray" };
              return (
                <button key={n.id} className="list-item" onClick={() => open(n)} style={{ background: n.read_at ? undefined : "color-mix(in srgb, var(--primary) 5%, transparent)" }}>
                  <div className={`stat-icon tone-${k.tone}`} style={{ width: 42, height: 42, borderRadius: 13 }}><k.icon /></div>
                  <div className="grow">
                    <div className={`small ${n.read_at ? "" : "bold"}`} style={{ lineHeight: 1.35 }}>{n.title}</div>
                    {n.body && <div className="tiny muted clamp-2 mt-4">{n.body}</div>}
                    <div className="tiny subtle mt-4">{relative(n.created_at)}</div>
                  </div>
                  {!n.read_at && <span className="dot" style={{ background: "var(--primary)", border: 0 }} />}
                </button>
              );
            })}
          </div>
        )}
      </Loader>
    </Page>
  );
}
