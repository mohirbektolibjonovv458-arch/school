import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Archive, CalendarPlus, KeyRound, Pencil, Phone, ScanFace, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { fmtDate, fmtDateTime, isoDate } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { Teacher } from "../../lib/types";
import { Alert, Avatar, Badge, Button, Card, Field, Input, Loader, Segment, Sheet, useConfirm } from "../../ui";
import FaceEnroll from "../../ui/FaceEnroll";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";
import { History, HistoryView } from "../teacher/Attendance";
import { AbsenceSheet } from "./Attendance";
import Credentials from "./Credentials";
import { TeacherForm } from "./Teachers";

export default function TeacherDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "profile" | "attendance") || "profile";
  const state = useApi<Teacher>(`teachers/${id}/`);
  const history = useApi<History>(tab === "attendance" ? `attendance/teachers/${id}/` : null);
  const [edit, setEdit] = useState(false);
  const [creds, setCreds] = useState<{ name: string; username: string; password: string } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [absence, setAbsence] = useState(false);
  const [enroll, setEnroll] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, el } = useConfirm();

  const reset = async (t: Teacher) => {
    if (!(await confirm("Parolni tiklaysizmi?", { text: "Yangi vaqtinchalik parol yaratiladi, eski parol va barcha kirishlar bekor bo'ladi." }))) return;
    const r = await api<{ username: string; temp_password: string }>(`teachers/${id}/reset-password/`, { method: "POST" });
    setCreds({ name: t.full_name, username: r.username, password: r.temp_password });
  };
  const archive = async (t: Teacher) => {
    if (t.is_active) {
      if (!(await confirm("O'qituvchini arxivlaysizmi?", { text: "U tizimga kira olmaydi. Davomat va vazifalar tarixi saqlanib qoladi.", danger: true, ok: "Arxivlash" }))) return;
      await api(`teachers/${id}/`, { method: "DELETE" });
      toast("Arxivlandi");
      nav("/d/teachers");
    } else {
      state.setData(await api(`teachers/${id}/`, { method: "PATCH", body: { is_active: true } }));
      toast("Qayta faollashtirildi");
    }
  };
  const deleteFace = async () => {
    if (!(await confirm("Yuz namunalarini o'chirasizmi?", { danger: true, ok: "O'chirish" }))) return;
    await api(`attendance/teachers/${id}/face/`, { method: "DELETE" });
    toast("Namunalar o'chirildi");
    state.reload(true);
  };
  const onEnrolled = async (d: { descriptors: number[][]; photo: string }) => {
    setBusy(true);
    try {
      await api(`attendance/teachers/${id}/face/enroll/`, { body: d });
      toast("Yuz ro'yxatdan o'tkazildi va tasdiqlandi");
      state.reload(true);
    } catch (e) { toast((e as ApiError).message, "error"); } finally { setBusy(false); setEnroll(false); }
  };

  return (
    <Page title={state.data?.full_name || "O'qituvchi"} back="/d/teachers" actions={state.data ? <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEdit(true)}><span className="hide-mobile">Tahrirlash</span></Button> : null}>
      <Loader state={state}>
        {(t) => (
          <div className="col gap-16">
            <div className="card row gap-16 wrap">
              <Avatar name={t.full_name} url={t.avatar_url} size={72} />
              <div className="grow">
                <div className="h2">{t.full_name}{t.middle_name ? ` ${t.middle_name}` : ""}</div>
                <div className="muted">{t.position}{t.category ? ` · ${t.category}` : ""}</div>
                <div className="row wrap gap-6 mt-8">
                  {!t.is_active && <Badge tone="red">Arxivda</Badge>}
                  {t.subject_names.map((s) => <Badge key={s} tone="primary">{s}</Badge>)}
                </div>
              </div>
              {t.phone && <a href={`tel:${t.phone}`} className="btn btn-secondary btn-sm"><Phone />{t.phone}</a>}
            </div>
            <Segment value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} items={[{ value: "profile", label: "Profil" }, { value: "attendance", label: "Davomat tarixi" }]} />
            {tab === "profile" ? (
              <div className="split">
                <div className="col gap-16">
                  <Card title="Sinflari">
                    {t.classes.length === 0 ? <div className="small subtle">Hali sinfga biriktirilmagan. Sinf sahifasidan biriktiring.</div> : (
                      <div className="col gap-8">
                        {t.classes.map((c) => (
                          <Link key={c.id} to={`/d/classes/${c.id}`} className="row between" style={{ padding: "6px 0" }}>
                            <b>{c.name} sinf</b><span className="small muted ellipsis">{c.subjects.join(", ")}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Card>
                  <Card title="Ma'lumotlar">
                    <div className="col gap-8 small">
                      <div className="row between"><span className="muted">Login</span><b>{t.username}</b></div>
                      <div className="row between"><span className="muted">Tug'ilgan sana</span><b>{fmtDate(t.birth_date, true)}</b></div>
                      <div className="row between"><span className="muted">Ishga kirgan</span><b>{fmtDate(t.hired_at, true)}</b></div>
                      <div className="row between"><span className="muted">Oxirgi kirish</span><b>{fmtDateTime(t.last_login)}</b></div>
                      {t.bio && <p className="muted mt-8 pre">{t.bio}</p>}
                    </div>
                  </Card>
                </div>
                <div className="col gap-16">
                  <Card title="Davomat usullari">
                    <div className="col gap-12">
                      <div className="row gap-12">
                        <div className="stat-icon tone-primary" style={{ width: 40, height: 40 }}><ScanFace /></div>
                        <div className="grow"><div className="bold small">Yuz orqali</div><div className="tiny subtle">{{ approved: "Faol", pending: "Tasdiq kutilmoqda", consent: "Rozilik bor, namuna yo'q", no_consent: "Rozilik berilmagan" }[t.face_status]}</div></div>
                        {t.face_status === "pending" && <Link to="/d/biometrics" className="btn btn-soft btn-sm">Ko'rish</Link>}
                        {(t.face_status === "approved" || t.face_status === "pending") && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={deleteFace}>O'chirish</Button>}
                      </div>
                      {t.face_status !== "no_consent" && <Button size="sm" variant="secondary" icon={<ScanFace />} onClick={() => setEnroll(true)}>Shu qurilmada ro'yxatdan o'tkazish</Button>}
                      {t.face_status === "no_consent" && <div className="tiny subtle">O'qituvchi o'z ilovasida (Menyu → Yuz orqali kirish) rozilik bersa, yuzni ro'yxatdan o'tkazish mumkin bo'ladi.</div>}
                      <div className="divider" style={{ margin: 0 }} />
                      <div className="row gap-12">
                        <div className="stat-icon tone-gray" style={{ width: 40, height: 40 }}><KeyRound /></div>
                        <div className="grow"><div className="bold small">PIN-kod</div><div className="tiny subtle">{t.pin_set ? "O'rnatilgan" : "O'rnatilmagan"}</div></div>
                        <Button size="sm" variant="secondary" onClick={() => setPinOpen(true)}>{t.pin_set ? "O'zgartirish" : "O'rnatish"}</Button>
                      </div>
                    </div>
                  </Card>
                  <Card title="Amallar">
                    <div className="col gap-8">
                      <Button variant="secondary" icon={<CalendarPlus />} onClick={() => setAbsence(true)}>Sababli kelmaslik qo'shish</Button>
                      <Button variant="secondary" icon={<ShieldCheck />} onClick={() => reset(t)}>Parolni tiklash</Button>
                      <Button variant={t.is_active ? "danger-soft" : "secondary"} icon={t.is_active ? <Archive /> : <Undo2 />} onClick={() => archive(t)}>{t.is_active ? "Arxivlash" : "Qayta faollashtirish"}</Button>
                    </div>
                  </Card>
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: 760 }}><Loader state={history}>{(h) => <HistoryView d={h} />}</Loader></div>
            )}
            <TeacherForm open={edit} edit={t} onClose={() => setEdit(false)} onSaved={(x) => state.setData(x)} />
            <PinSheet open={pinOpen} id={t.id} onClose={() => setPinOpen(false)} onSaved={() => state.reload(true)} />
            <AbsenceSheet open={absence} teacher={t.id} date={isoDate()} onClose={() => setAbsence(false)} onSaved={() => history.reload(true)} />
            <Sheet open={enroll} onClose={() => setEnroll(false)} title={`${t.full_name}: yuzni ro'yxatdan o'tkazish`}>
              {enroll && <FaceEnroll onDone={onEnrolled} onCancel={() => setEnroll(false)} busy={busy} />}
            </Sheet>
          </div>
        )}
      </Loader>
      <Credentials data={creds} onClose={() => setCreds(null)} />
      {el}
    </Page>
  );
}

function PinSheet({ open, id, onClose, onSaved }: { open: boolean; id: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const save = async (value: string) => {
    setErr(null);
    try {
      await api(`teachers/${id}/set-pin/`, { body: { pin: value } });
      toast(value ? "PIN o'rnatildi — o'qituvchiga ayting" : "PIN olib tashlandi");
      setPin(""); onSaved(); onClose();
    } catch (e) { setErr(e as ApiError); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Kiosk PIN-kodi" footer={<><Button variant="ghost" onClick={() => save("")}>Olib tashlash</Button><Button disabled={pin.length < 4} onClick={() => save(pin)}>Saqlash</Button></>}>
      <div className="col gap-12">
        {err && <Alert tone="error">{err.message}</Alert>}
        <Field label="PIN (4–6 raqam)" error={err?.field("pin")}><Input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: 8, fontSize: 22, textAlign: "center" }} /></Field>
        <p className="tiny subtle">Yaxshisi, o'qituvchi PIN-kodni o'zi ilovada o'rnatsin (Menyu → Yuz orqali kirish).</p>
      </div>
    </Sheet>
  );
}
