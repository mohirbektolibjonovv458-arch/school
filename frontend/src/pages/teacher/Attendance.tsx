import { Clock3, LogIn, LogOut } from "lucide-react";
import { fmtDate, WD_SHORT } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { AttBadge, Empty, Loader, Ring, Stat } from "../../ui";
import { Page } from "../../ui/Shell";

export interface History {
  teacher: { id: number; full_name: string };
  days: { date: string; weekday: number; status: string; status_label: string; expected_at: string | null; check_in: string | null; check_out: string | null; in_method: string | null; late_minutes: number; absence: string | null; note: string }[];
  summary: { workdays: number; present: number; late: number; absent: number; excused: number; late_minutes: number; avg_arrival: string | null; worked_hours: number; rate: number | null };
  absences: { id: number; date_from: string; date_to: string; reason: string; reason_label: string; note: string }[];
}

export const METHOD: Record<string, string> = { face: "Yuz", pin: "PIN", manual: "Qo'lda" };

export function HistoryView({ d }: { d: History }) {
  const s = d.summary;
  return (
    <div className="col gap-16">
      <div className="card row gap-16 wrap">
        <Ring value={s.rate} size={84} stroke={8} color="var(--green)" />
        <div className="grid-2 grow" style={{ gap: 10 }}>
          <div><div className="tiny subtle">O'z vaqtida</div><div className="h3 num">{s.present}</div></div>
          <div><div className="tiny subtle">Kechikkan</div><div className="h3 num" style={{ color: s.late ? "var(--amber)" : undefined }}>{s.late} <span className="tiny subtle">({s.late_minutes} daq.)</span></div></div>
          <div><div className="tiny subtle">Kelmagan</div><div className="h3 num" style={{ color: s.absent ? "var(--red)" : undefined }}>{s.absent}</div></div>
          <div><div className="tiny subtle">O'rtacha kelish</div><div className="h3 num">{s.avg_arrival || "—"}</div></div>
        </div>
      </div>
      <div className="grid-2">
        <Stat label="Sababli kunlar" value={s.excused} tone="blue" />
        <Stat label="Ishlagan soat" value={s.worked_hours} tone="primary" hint="kirish–chiqish bo'yicha" />
      </div>
      {d.days.length === 0 ? <Empty icon={<Clock3 />} title="Davomat yozuvlari yo'q" /> : (
        <div className="card pad-0">
          {d.days.map((x) => (
            <div key={x.date} className="list-item">
              <div style={{ width: 46, textAlign: "center", flexShrink: 0 }}>
                <div className="tiny subtle bold">{WD_SHORT[x.weekday]}</div>
                <div className="bold num">{fmtDate(x.date).split("-")[0]}</div>
              </div>
              <div className="grow">
                <div className="row wrap gap-8 small num">
                  {x.check_in ? <span className="row gap-4"><LogIn size={14} style={{ color: "var(--green)" }} />{x.check_in}</span> : <span className="subtle">—</span>}
                  {x.check_out && <span className="row gap-4"><LogOut size={14} style={{ color: "var(--text-3)" }} />{x.check_out}</span>}
                  {x.in_method && <span className="tiny subtle">({METHOD[x.in_method]})</span>}
                </div>
                <div className="tiny subtle">{x.absence ? x.absence : x.expected_at ? `Kutilgan: ${x.expected_at}` : ""}{x.late_minutes ? ` · +${x.late_minutes} daq.` : ""}{x.note ? ` · ${x.note}` : ""}</div>
              </div>
              <AttBadge status={x.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeacherAttendance() {
  const state = useApi<History>("my/attendance/");
  return (
    <Page title="Mening davomatim" back>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p className="small muted" style={{ marginBottom: 12 }}>Oxirgi 30 kun. Kelish va ketish vaqtlari darvozadagi qurilma orqali yoziladi.</p>
        <Loader state={state}>{(d) => <HistoryView d={d} />}</Loader>
      </div>
    </Page>
  );
}
