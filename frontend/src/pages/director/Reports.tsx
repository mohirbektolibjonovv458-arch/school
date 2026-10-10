import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlarmClock, Check, ChevronLeft, ChevronRight, Download, Percent, UserX } from "lucide-react";
import { download, qs } from "../../lib/api";
import { addDays, fmtDate, isoDate, isoWeekday, WD_SHORT } from "../../lib/format";
import { useApi, useDesktop } from "../../lib/hooks";
import { Avatar, Button, Card, Empty, IconButton, ListSkeleton, Loader, Segment, Stat, StackBars } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

interface TRow { teacher: { id: number; full_name: string; position: string; avatar_url: string | null }; workdays: number; present: number; late: number; absent: number; excused: number; late_minutes: number; avg_arrival: string | null; worked_hours: number; rate: number | null }
interface R { start: string; end: string; totals: { workdays?: number; present?: number; late?: number; absent?: number; excused?: number; late_minutes?: number; rate: number | null; punctuality: number | null }; series: { date: string; present: number; late: number; absent: number; excused: number }[]; teachers: TRow[] }

export default function Reports() {
  const nav = useNavigate();
  const toast = useToast();
  const desktop = useDesktop();
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [anchor, setAnchor] = useState(new Date());
  const state = useApi<R>(`attendance/report/${qs({ period, date: isoDate(anchor) })}`);
  const shift = (n: number) => {
    const a = new Date(anchor);
    if (period === "day") a.setDate(a.getDate() + n);
    else if (period === "week") a.setDate(a.getDate() + 7 * n);
    else a.setMonth(a.getMonth() + n);
    setAnchor(a);
  };
  const exportCsv = async () => {
    try { await download(`/api/attendance/report/${qs({ period, date: isoDate(anchor), export: "csv" })}`, `davomat_${period}_${isoDate(anchor)}.csv`); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const future = addDays(anchor, 0) >= new Date(new Date().toDateString());

  return (
    <Page title="Hisobotlar" actions={<Button size="sm" variant="secondary" icon={<Download />} onClick={exportCsv}><span className="hide-mobile">Excel (CSV)</span></Button>}>
      <div className="col gap-12">
        <Segment value={period} onChange={(v) => { setPeriod(v); setAnchor(new Date()); }} items={[{ value: "day", label: "Kunlik" }, { value: "week", label: "Haftalik" }, { value: "month", label: "Oylik" }]} />
        <div className="card row gap-8" style={{ padding: 8 }}>
          <IconButton label="Oldingi" onClick={() => shift(-1)}><ChevronLeft /></IconButton>
          <div className="grow bold" style={{ textAlign: "center" }}>{state.data ? (state.data.start === state.data.end ? fmtDate(state.data.start, true) : `${fmtDate(state.data.start)} – ${fmtDate(state.data.end, true)}`) : "…"}</div>
          <IconButton label="Keyingi" onClick={() => shift(1)} disabled={future}><ChevronRight /></IconButton>
        </div>
        <Loader state={state} skeleton={<ListSkeleton rows={6} />}>
          {(r) => (
            <div className="col gap-16">
              <div className="grid-2 grid-4-md">
                <Stat label="Davomat" value={r.totals.rate !== null ? `${r.totals.rate}%` : "—"} icon={<Percent />} tone="green" hint="sababli kunlarsiz" />
                <Stat label="O'z vaqtida kelish" value={r.totals.punctuality !== null ? `${r.totals.punctuality}%` : "—"} icon={<Check />} tone="primary" />
                <Stat label="Kechikishlar" value={r.totals.late ?? 0} icon={<AlarmClock />} tone="amber" hint={`jami ${r.totals.late_minutes ?? 0} daqiqa`} />
                <Stat label="Sababsiz kelmaslik" value={r.totals.absent ?? 0} icon={<UserX />} tone="red" hint={`${r.totals.excused ?? 0} sababli`} />
              </div>
              {r.series.length > 1 && (
                <Card title="Kunlar kesimida">
                  <StackBars data={r.series.slice(-31).map((s) => { const d = new Date(s.date + "T00:00"); return { label: period === "month" ? String(d.getDate()) : WD_SHORT[isoWeekday(d)], values: s }; })}
                    keys={[{ key: "present", color: "var(--green)", label: "O'z vaqtida" }, { key: "late", color: "var(--amber)", label: "Kechikkan" }, { key: "absent", color: "var(--red)", label: "Kelmagan" }, { key: "excused", color: "var(--blue)", label: "Sababli" }]} />
                </Card>
              )}
              <Card title="O'qituvchilar kesimida" className="pad-0">
                {r.teachers.length === 0 ? <Empty title="Ma'lumot yo'q" /> : desktop ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>O'qituvchi</th><th>Ish kuni</th><th>O'z vaqtida</th><th>Kechikkan</th><th>Kechikish</th><th>Kelmagan</th><th>Sababli</th><th>O'rt. kelish</th><th>Soat</th><th>Davomat</th></tr></thead>
                      <tbody>
                        {r.teachers.map((t) => (
                          <tr key={t.teacher.id} className="clickable" onClick={() => nav(`/d/teachers/${t.teacher.id}?tab=attendance`)}>
                            <td><div className="row gap-8"><Avatar name={t.teacher.full_name} url={t.teacher.avatar_url} size={30} /><b className="ellipsis">{t.teacher.full_name}</b></div></td>
                            <td className="num">{t.workdays}</td><td className="num">{t.present}</td>
                            <td className="num" style={{ color: t.late ? "var(--amber)" : undefined }}>{t.late}</td>
                            <td className="num">{t.late_minutes} daq.</td>
                            <td className="num" style={{ color: t.absent ? "var(--red)" : undefined }}>{t.absent}</td>
                            <td className="num">{t.excused}</td><td className="num">{t.avg_arrival || "—"}</td><td className="num">{t.worked_hours}</td>
                            <td><b className="num">{t.rate !== null ? `${t.rate}%` : "—"}</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div>
                    {r.teachers.map((t) => (
                      <button key={t.teacher.id} className="list-item" onClick={() => nav(`/d/teachers/${t.teacher.id}?tab=attendance`)}>
                        <Avatar name={t.teacher.full_name} url={t.teacher.avatar_url} size={40} />
                        <div className="grow">
                          <div className="bold small ellipsis">{t.teacher.full_name}</div>
                          <div className="tiny muted">Kechikish {t.late} ({t.late_minutes} daq.) · kelmagan {t.absent} · o'rt. {t.avg_arrival || "—"}</div>
                        </div>
                        <b className="num" style={{ color: t.rate !== null && t.rate < 90 ? "var(--red)" : "var(--green)" }}>{t.rate !== null ? `${t.rate}%` : "—"}</b>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </Loader>
      </div>
    </Page>
  );
}
