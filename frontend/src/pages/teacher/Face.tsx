import { useState } from "react";
import { CheckCircle2, Clock, KeyRound, ScanFace, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { Alert, Badge, Button, Card, Field, Input, Loader, Sheet, useConfirm } from "../../ui";
import FaceEnroll from "../../ui/FaceEnroll";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

export interface FaceState {
  consent: { active: boolean; given_at: string | null; withdrawn_at: string | null; version: string };
  consent_text: string;
  enrollments: { id: number; status: "pending" | "approved" | "rejected"; samples: number; created_at: string; reject_reason: string; reviewed_at: string | null }[];
  pin_set: boolean;
  require_liveness: boolean;
}

export default function TeacherFace() {
  const toast = useToast();
  const state = useApi<FaceState>("my/face/");
  const [agree, setAgree] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { confirm, el } = useConfirm();

  const giveConsent = async () => { state.setData(await api("my/face/", { body: { agree: true } })); toast("Rozilik qayd etildi"); };
  const withdraw = async () => {
    if (!(await confirm("Rozilikni qaytarib olasizmi?", { text: "Barcha yuz namunalaringiz darhol o'chiriladi. Davomatdan PIN-kod yoki direktor orqali o'tasiz.", danger: true, ok: "Qaytarib olish" }))) return;
    state.setData(await api("my/face/", { method: "DELETE" }));
    toast("Rozilik qaytarib olindi, namunalar o'chirildi");
  };
  const onCaptured = async (d: { descriptors: number[][]; photo: string }) => {
    setSending(true);
    setErr(null);
    try {
      state.setData(await api("my/face/enroll/", { body: d }));
      toast("Namunalar yuborildi. Direktor tasdiqlagach faollashadi");
      setCapturing(false);
    } catch (e) {
      setErr((e as ApiError).message);
      setCapturing(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Page title="Yuz orqali kirish" back>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <Loader state={state}>
          {(s) => {
            const approved = s.enrollments.find((e) => e.status === "approved");
            const pending = s.enrollments.find((e) => e.status === "pending");
            const rejected = s.enrollments.find((e) => e.status === "rejected");
            if (capturing) return <Card title="Yuz namunalarini olish"><FaceEnroll onDone={onCaptured} onCancel={() => setCapturing(false)} busy={sending} /></Card>;
            return (
              <div className="col gap-16">
                <div className="hero">
                  <div className="row gap-12" style={{ position: "relative", zIndex: 1 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 18, background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center" }}><ScanFace size={30} /></div>
                    <div className="grow">
                      <div className="h3">{approved ? "Yuz orqali davomat yoqilgan" : pending ? "Tasdiq kutilmoqda" : "Darvozadan yuzingiz bilan o'ting"}</div>
                      <div className="small muted">{approved ? "Darvozadagi planshetga qarang — kelish va ketish vaqtingiz o'zi yoziladi" : "Bir martalik sozlash, taxminan 30 soniya"}</div>
                    </div>
                  </div>
                </div>
                {err && <Alert tone="error">{err}</Alert>}

                {!s.consent.active ? (
                  <Card title="Biometrik ma'lumotlarga rozilik">
                    <div className="col gap-12">
                      <div className="small pre" style={{ background: "var(--surface-2)", padding: 14, borderRadius: 14, lineHeight: 1.6 }}>{s.consent_text}</div>
                      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span className="small">Matn bilan tanishdim va roziman</span></label>
                      <Button block icon={<ShieldCheck />} disabled={!agree} onClick={giveConsent}>Rozilik berish</Button>
                      <p className="tiny subtle">Rozilik ixtiyoriy. Rozi bo'lmasangiz PIN-kod orqali belgilanishingiz mumkin.</p>
                    </div>
                  </Card>
                ) : (
                  <Card title="Holat" action={<Badge tone="green" icon={<CheckCircle2 />}>Rozilik berilgan</Badge>}>
                    <div className="col gap-12">
                      {approved && <Alert tone="success">Namunalar tasdiqlangan ({fmtDateTime(approved.reviewed_at)}). Yangilash uchun qayta suratga olishingiz mumkin.</Alert>}
                      {pending && <Alert tone="info" icon={<Clock />}>Namunalar {fmtDateTime(pending.created_at)} da yuborildi. Direktor tasdiqlashini kuting.</Alert>}
                      {rejected && !approved && !pending && <Alert tone="error" icon={<XCircle />}>Rad etildi: {rejected.reject_reason}. Qaytadan urinib ko'ring.</Alert>}
                      <Button block size="lg" icon={<ScanFace />} onClick={() => { setErr(null); setCapturing(true); }}>{approved || pending ? "Qayta suratga olish" : "Yuzni ro'yxatdan o'tkazish"}</Button>
                      <div className="small muted">
                        Serverda rasmingiz emas, balki yuzingizning shifrlangan raqamli namunasi saqlanadi. Tasdiqlash uchun direktor bitta kichik suratni ko'radi.
                      </div>
                      <Button variant="danger-soft" icon={<Trash2 />} onClick={withdraw}>Rozilikni qaytarib olish</Button>
                    </div>
                  </Card>
                )}

                <Card title="Zaxira usul: PIN-kod" action={s.pin_set ? <Badge tone="green">O'rnatilgan</Badge> : <Badge tone="gray">O'rnatilmagan</Badge>}>
                  <p className="small muted">Kamera ishlamasa yoki yuz tanilmasa, kioskda ismingizni tanlab PIN-kodni kiritasiz.</p>
                  <Button className="mt-12" variant="secondary" icon={<KeyRound />} onClick={() => setPinOpen(true)}>{s.pin_set ? "PIN-kodni o'zgartirish" : "PIN-kod o'rnatish"}</Button>
                </Card>
              </div>
            );
          }}
        </Loader>
      </div>
      <PinSheet open={pinOpen} onClose={() => setPinOpen(false)} onSaved={() => state.reload(true)} />
      {el}
    </Page>
  );
}

function PinSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api("my/pin/", { body: { pin, password: pw } });
      toast("PIN-kod saqlandi");
      setPin(""); setPw("");
      onSaved(); onClose();
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="PIN-kod" footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={busy} disabled={pin.length < 4 || !pw} onClick={save}>Saqlash</Button></>}>
      <div className="col gap-16">
        {err && !err.errors && <Alert tone="error">{err.message}</Alert>}
        <Field label="Yangi PIN (4–6 raqam)" error={err?.field("pin")}>
          <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: 8, fontSize: 22, textAlign: "center" }} />
        </Field>
        <Field label="Tasdiqlash uchun parolingiz" error={err?.field("password")}><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
        <p className="tiny subtle">1111, 1234 kabi oson PIN qabul qilinmaydi. PIN-kodni hech kimga aytmang.</p>
      </div>
    </Sheet>
  );
}
