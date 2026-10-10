import { useEffect, useRef, useState } from "react";
import { Camera, Plus, Save, Trash2, Wand2 } from "lucide-react";
import { api, ApiError, upload } from "../../lib/api";
import { WD_SHORT } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { compressImage } from "../../lib/image";
import { Alert, Button, Card, Field, IconButton, Input, Loader, Sheet, Switch } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

interface Period { number: number; start: string; end: string }
interface S {
  name: string; short_name: string; address: string; phone: string; logo_url: string | null; academic_year: string; work_days: number[];
  work_start: string; work_end: string; late_grace_minutes: number; arrive_before_lesson_minutes: number; use_timetable_for_arrival: boolean;
  absent_alert_after_minutes: number; checkout_min_minutes: number; face_threshold: number; require_liveness: boolean;
  store_checkin_photos: boolean; photo_retention_days: number; daily_report_time: string; periods: Period[];
}

const hm = (t: string) => t?.slice(0, 5);

export default function Settings() {
  const toast = useToast();
  const state = useApi<S>("school/");
  const [d, setD] = useState<S | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state.data) setD({ ...state.data, work_start: hm(state.data.work_start), work_end: hm(state.data.work_end), daily_report_time: hm(state.data.daily_report_time) }); }, [state.data]);
  const set = <K extends keyof S>(k: K, v: S[K]) => setD((x) => (x ? { ...x, [k]: v } : x));

  const save = async () => {
    if (!d) return;
    setBusy(true); setErr(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { periods, logo_url, ...body } = d;
      state.setData(await api("school/", { method: "PATCH", body }));
      toast("Sozlamalar saqlandi");
    } catch (e) { setErr(e as ApiError); window.scrollTo({ top: 0, behavior: "smooth" }); } finally { setBusy(false); }
  };
  const onLogo = async (f?: File) => {
    if (!f) return;
    const fd = new FormData(); fd.append("file", await compressImage(f, 600));
    try { await upload("school/logo/", fd); state.reload(true); toast("Logo yangilandi"); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Page title="Sozlamalar" actions={<Button size="sm" icon={<Save />} loading={busy} onClick={save}>Saqlash</Button>}>
      <Loader state={state}>
        {() => d && (
          <div className="col gap-16" style={{ maxWidth: 820, margin: "0 auto" }}>
            {err && <Alert tone="error">{err.message}</Alert>}
            <Card title="Maktab">
              <div className="row gap-16" style={{ marginBottom: 14 }}>
                <button className="avatar" onClick={() => logoRef.current?.click()} style={{ width: 72, height: 72, borderRadius: 20, background: "var(--surface-2)", border: "1px dashed var(--border-strong)", cursor: "pointer", color: "var(--text-3)" }}>
                  {d.logo_url ? <img src={d.logo_url} alt="" /> : <Camera />}
                </button>
                <input ref={logoRef} hidden type="file" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} />
                <div className="small muted">Maktab logotipi kiosk ekranida va hisobotlarda ko'rinadi</div>
              </div>
              <div className="form-grid two">
                <Field label="Maktab nomi" className="full"><Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Toshkent shahar 110-maktab" /></Field>
                <Field label="Manzil"><Input value={d.address} onChange={(e) => set("address", e.target.value)} /></Field>
                <Field label="Telefon"><Input value={d.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="O'quv yili"><Input value={d.academic_year} onChange={(e) => set("academic_year", e.target.value)} /></Field>
              </div>
            </Card>

            <Card title="Ish vaqti">
              <div className="col gap-16">
                <Field label="Ish kunlari" error={err?.field("work_days")}>
                  <div className="row wrap gap-8">
                    {[1, 2, 3, 4, 5, 6, 7].map((w) => {
                      const on = d.work_days.includes(w);
                      return <button key={w} type="button" className={`chip ${on ? "active" : ""}`} style={{ minWidth: 48, justifyContent: "center" }} onClick={() => set("work_days", on ? d.work_days.filter((x) => x !== w) : [...d.work_days, w].sort())}>{WD_SHORT[w]}</button>;
                    })}
                  </div>
                </Field>
                <div className="form-grid two">
                  <Field label="Ish boshlanishi"><Input type="time" value={d.work_start} onChange={(e) => set("work_start", e.target.value)} /></Field>
                  <Field label="Ish tugashi" error={err?.field("work_end")}><Input type="time" value={d.work_end} onChange={(e) => set("work_end", e.target.value)} /></Field>
                </div>
              </div>
            </Card>

            <Periods initial={state.data!.periods} onSaved={() => state.reload(true)} />

            <Card title="Davomat qoidalari">
              <div className="col gap-16">
                <label className="row between gap-12"><span><b>Dars jadvaliga qarab hisoblash</b><div className="tiny subtle">O'qituvchi birinchi darsidan oldin kelishi kutiladi; darsi yo'q kun — dam olish. O'chirilsa, hamma uchun ish boshlanish vaqti.</div></span><Switch checked={d.use_timetable_for_arrival} onChange={(v) => set("use_timetable_for_arrival", v)} /></label>
                <div className="form-grid two">
                  <Field label="Birinchi darsdan necha daqiqa oldin kelish" help="Jadvalga qarab hisoblashda"><Input type="number" min={0} max={120} value={d.arrive_before_lesson_minutes} onChange={(e) => set("arrive_before_lesson_minutes", Number(e.target.value))} /></Field>
                  <Field label="Kechikish imtiyozi (daqiqa)" help="Shu vaqtgacha kechikish hisoblanmaydi"><Input type="number" min={0} max={60} value={d.late_grace_minutes} onChange={(e) => set("late_grace_minutes", Number(e.target.value))} /></Field>
                  <Field label="Kelmaganlik haqida xabar (daqiqa)" help="Kutilgan vaqtdan keyin"><Input type="number" min={5} max={240} value={d.absent_alert_after_minutes} onChange={(e) => set("absent_alert_after_minutes", Number(e.target.value))} /></Field>
                  <Field label="Chiqish deb hisoblash (daqiqa)" help="Kirgandan keyin shuncha vaqt o'tib skan — chiqish"><Input type="number" min={5} max={600} value={d.checkout_min_minutes} onChange={(e) => set("checkout_min_minutes", Number(e.target.value))} /></Field>
                  <Field label="Kunlik yakuniy hisobot (Telegram)"><Input type="time" value={d.daily_report_time} onChange={(e) => set("daily_report_time", e.target.value)} /></Field>
                </div>
              </div>
            </Card>

            <Card title="Yuz orqali tanish">
              <div className="col gap-16">
                <Field label={`Aniqlik chegarasi: ${d.face_threshold.toFixed(2)}`} help="Kichikroq — qat'iyroq (begonani tanib olish ehtimoli kamayadi, lekin qayta urinish ko'payadi). Tavsiya: 0.45–0.50" error={err?.field("face_threshold")}>
                  <input type="range" min={0.35} max={0.6} step={0.01} value={d.face_threshold} onChange={(e) => set("face_threshold", Number(e.target.value))} style={{ width: "100%", accentColor: "var(--primary)" }} />
                </Field>
                <label className="row between gap-12"><span><b>Jonlilik tekshiruvi</b><div className="tiny subtle">Kiosk ko'z qisishni kutadi — telefon yoki qog'ozdagi rasm bilan aldab bo'lmaydi</div></span><Switch checked={d.require_liveness} onChange={(v) => set("require_liveness", v)} /></label>
                <label className="row between gap-12"><span><b>Kirish suratini saqlash</b><div className="tiny subtle">Har bir skanda kichik surat — shubhali holatlarni tekshirish uchun</div></span><Switch checked={d.store_checkin_photos} onChange={(v) => set("store_checkin_photos", v)} /></label>
                {d.store_checkin_photos && <Field label="Suratlarni saqlash muddati (kun)"><Input type="number" min={1} max={365} value={d.photo_retention_days} onChange={(e) => set("photo_retention_days", Number(e.target.value))} /></Field>}
              </div>
            </Card>
            <Button size="lg" icon={<Save />} loading={busy} onClick={save}>Sozlamalarni saqlash</Button>
          </div>
        )}
      </Loader>
    </Page>
  );
}

function Periods({ initial, onSaved }: { initial: Period[]; onSaved: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Period[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState(false);
  const [g, setG] = useState({ start: "08:30", count: "6", len: "45", brk: "10", big: "20", bigAfter: "3" });
  useEffect(() => setRows(initial.map((p) => ({ number: p.number, start: hm(p.start), end: hm(p.end) }))), [initial]);
  const upd = (i: number, k: "start" | "end", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const add = () => setRows((r) => {
    const last = r[r.length - 1];
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const s = last ? toMin(last.end) + 10 : 8 * 60 + 30;
    return [...r, { number: (last?.number || 0) + 1, start: fmt(s), end: fmt(s + 45) }];
  });
  const generate = () => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    let t = toMin(g.start);
    const out: Period[] = [];
    for (let i = 1; i <= Number(g.count); i++) {
      out.push({ number: i, start: fmt(t), end: fmt(t + Number(g.len)) });
      t += Number(g.len) + (i === Number(g.bigAfter) ? Number(g.big) : Number(g.brk));
    }
    setRows(out); setGen(false);
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api("school/periods/", { method: "PUT", body: rows }); toast("Qo'ng'iroq jadvali saqlandi"); onSaved(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card title="Qo'ng'iroq jadvali" action={<Button size="sm" variant="ghost" icon={<Wand2 />} onClick={() => setGen(true)}>Avto</Button>}>
      <div className="col gap-8">
        {err && <Alert tone="error">{err}</Alert>}
        {rows.length === 0 && <div className="small subtle">Darslar vaqti kiritilmagan. «Avto» tugmasi bilan tez to'ldiring.</div>}
        {rows.map((r, i) => (
          <div key={i} className="period-row">
            <b className="num small">{r.number}.</b>
            <Input type="time" value={r.start} onChange={(e) => upd(i, "start", e.target.value)} />
            <span className="subtle">–</span>
            <Input type="time" value={r.end} onChange={(e) => upd(i, "end", e.target.value)} />
            <IconButton label="O'chirish" onClick={() => setRows((x) => x.filter((_, j) => j !== i).map((p, j) => ({ ...p, number: j + 1 })))}><Trash2 /></IconButton>
          </div>
        ))}
        <div className="row gap-8 mt-8">
          <Button size="sm" variant="secondary" icon={<Plus />} onClick={add} disabled={rows.length >= 12}>Dars qo'shish</Button>
          <Button size="sm" loading={busy} onClick={save} disabled={!rows.length}>Jadvalni saqlash</Button>
        </div>
      </div>
      <Sheet open={gen} onClose={() => setGen(false)} title="Avtomatik to'ldirish" footer={<><Button variant="secondary" onClick={() => setGen(false)}>Bekor qilish</Button><Button onClick={generate}>To'ldirish</Button></>}>
        <div className="form-grid two">
          <Field label="1-dars boshlanishi"><Input type="time" value={g.start} onChange={(e) => setG({ ...g, start: e.target.value })} /></Field>
          <Field label="Darslar soni"><Input type="number" min={1} max={12} value={g.count} onChange={(e) => setG({ ...g, count: e.target.value })} /></Field>
          <Field label="Dars davomiyligi (daq.)"><Input type="number" value={g.len} onChange={(e) => setG({ ...g, len: e.target.value })} /></Field>
          <Field label="Tanaffus (daq.)"><Input type="number" value={g.brk} onChange={(e) => setG({ ...g, brk: e.target.value })} /></Field>
          <Field label="Katta tanaffus (daq.)"><Input type="number" value={g.big} onChange={(e) => setG({ ...g, big: e.target.value })} /></Field>
          <Field label="Katta tanaffus nechanchi darsdan keyin"><Input type="number" value={g.bigAfter} onChange={(e) => setG({ ...g, bigAfter: e.target.value })} /></Field>
        </div>
      </Sheet>
    </Card>
  );
}
