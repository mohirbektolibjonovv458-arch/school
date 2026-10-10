import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { fmtDate } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { Empty, ListSkeleton, Loader, Ring, SectionTitle } from "../../ui";
import { Page } from "../../ui/Shell";

interface G {
  average: number | null;
  subjects: { subject: string; color: string; count: number; average: number }[];
  items: { id: number; homework_id: number; title: string; subject: string; color: string; score: number; max_score: number; normalized: number; reviewed_at: string; feedback: string }[];
}

export default function Grades() {
  const state = useApi<G>("my/grades/");
  return (
    <Page title="Baholarim" back>
      <Loader state={state} skeleton={<ListSkeleton />} empty={(d) => d.items.length === 0 ? <Empty icon={<Star />} title="Hali baho yo'q" text="O'qituvchi vazifangizni qabul qilgach, baholar shu yerda ko'rinadi" /> : null}>
        {(d) => (
          <div className="split">
            <div className="col gap-16">
              <div className="card row gap-20">
                <Ring value={d.average !== null ? (d.average / 5) * 100 : null} size={96} stroke={9} color="var(--green)" label={<div><div className="h2 num">{d.average ?? "—"}</div><div className="tiny subtle">5 dan</div></div>} />
                <div><div className="h3">Umumiy o'rtacha</div><div className="small muted">{d.items.length} ta baho asosida</div></div>
              </div>
              <div className="card col gap-12">
                {d.subjects.map((s) => (
                  <div key={s.subject}>
                    <div className="row between small" style={{ marginBottom: 6 }}><b>{s.subject}</b><span className="num"><b>{s.average}</b> <span className="subtle">· {s.count} ta</span></span></div>
                    <div className="progress"><div style={{ width: `${(s.average / 5) * 100}%`, background: s.color }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <SectionTitle title="So'nggi baholar" />
              <div className="card pad-0">
                {d.items.map((g) => (
                  <Link key={g.id} to={`/s/homework/${g.homework_id}`} className="list-item">
                    <div style={{ width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, color: "#fff", background: g.normalized >= 4.5 ? "var(--green)" : g.normalized >= 3.5 ? "var(--blue)" : g.normalized >= 2.5 ? "var(--amber)" : "var(--red)", flexShrink: 0 }}>{g.score}</div>
                    <div className="grow"><div className="tiny bold" style={{ color: g.color }}>{g.subject}</div><div className="bold small ellipsis">{g.title}</div><div className="tiny subtle">{fmtDate(g.reviewed_at)} · {g.max_score} balldan</div></div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </Loader>
    </Page>
  );
}

