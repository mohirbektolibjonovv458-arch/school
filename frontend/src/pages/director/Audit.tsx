import { FileClock } from "lucide-react";
import { fmtDateTime } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { Paged } from "../../lib/types";
import { Empty, ListSkeleton, Loader } from "../../ui";
import { Page } from "../../ui/Shell";

interface A { id: number; action: string; label: string; target: string; actor: string | null; ip: string | null; created_at: string }

export default function Audit() {
  const state = useApi<Paged<A>>("audit/?page_size=200");
  return (
    <Page title="Amallar tarixi" back>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <p className="small muted" style={{ marginBottom: 12 }}>Tizimdagi muhim amallar: kirishlar, akkauntlar, davomatni qo'lda o'zgartirish, biometrika va sozlamalar.</p>
        <Loader state={state} skeleton={<ListSkeleton rows={10} />} empty={(d) => d.results.length === 0 ? <Empty icon={<FileClock />} title="Hozircha yozuvlar yo'q" /> : null}>
          {(d) => (
            <div className="card pad-0">
              {d.results.map((a) => (
                <div key={a.id} className="list-item">
                  <div className="grow">
                    <div className="small"><b>{a.actor || "Tizim"}</b> — {a.label}{a.target ? <>: <span className="muted">{a.target}</span></> : null}</div>
                    <div className="tiny subtle">{fmtDateTime(a.created_at)}{a.ip ? ` · ${a.ip}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Loader>
      </div>
    </Page>
  );
}
