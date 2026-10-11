import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, MessageCircle, Pencil, Send } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useInterval } from "../../lib/hooks";
import { Alert, Button } from "../../ui";

type Purpose = "login" | "register";
interface SendResp { status: "sent" | "link"; resend_in?: number; link_token?: string; bot_url?: string | null }

/** 90 123 45 67 ko'rinishida formatlash */
function fmt(d: string) {
  const x = d.slice(0, 9);
  return [x.slice(0, 2), x.slice(2, 5), x.slice(5, 7), x.slice(7, 9)].filter(Boolean).join(" ");
}

export function PhoneInput({ value, onChange, autoFocus }: { value: string; onChange: (digits: string) => void; autoFocus?: boolean }) {
  return (
    <div className="phone-field">
      <span className="cc">🇺🇿 +998</span>
      <input type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="90 123 45 67" value={fmt(value)} autoFocus={autoFocus}
        onChange={(e) => {
          let d = e.target.value.replace(/\D/g, "");
          if (d.startsWith("998") && d.length > 9) d = d.slice(3);
          onChange(d.slice(0, 9));
        }} />
    </div>
  );
}

function OtpBoxes({ value, onChange, error, disabled }: { value: string; onChange: (v: string) => void; error?: boolean; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState(true);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="otp" onClick={() => ref.current?.focus()}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`box ${focus && i === Math.min(value.length, 3) ? "active" : ""} ${error ? "err" : ""}`}>{value[i] || ""}</div>
      ))}
      <input ref={ref} value={value} disabled={disabled} inputMode="numeric" autoComplete="one-time-code" maxLength={4} aria-label="Tasdiqlash kodi"
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))} />
    </div>
  );
}

/**
 * Telefon raqamni Telegram bot orqali tasdiqlash.
 * login → onVerified({access, refresh, user}); register → onVerified({phone, phone_token})
 */
export default function PhoneOtp({ purpose, onVerified, submitLabel = "Kod olish" }: { purpose: Purpose; onVerified: (data: any) => Promise<void> | void; submitLabel?: string }) {
  const [step, setStep] = useState<"phone" | "link" | "code">("phone");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [link, setLink] = useState<{ token: string; url: string | null } | null>(null);
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const phone = "+998" + digits;

  useInterval(() => setResendIn((x) => Math.max(0, x - 1)), resendIn > 0 ? 1000 : null);

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<SendResp>("auth/otp/send/", { body: { phone, purpose } });
      if (r.status === "link") {
        setLink({ token: r.link_token!, url: r.bot_url ?? null });
        setStep("link");
      } else {
        setBotUrl(r.bot_url ?? null);
        setResendIn(r.resend_in ?? 45);
        setCode("");
        setStep("code");
      }
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  // Botda raqam ulashilishini kutamiz — ulangach kod avtomatik yuboriladi
  useInterval(async () => {
    if (!link || busy) return;
    try {
      const r = await api<{ linked: boolean; expired?: boolean }>(`auth/otp/link/${link.token}/`);
      if (r.linked) { setLink(null); await send(); }
    } catch { /* tarmoq — keyingi urinish */ }
  }, step === "link" ? 2500 : null);

  const verify = async (value: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api("auth/otp/verify/", { body: { phone, code: value, purpose } });
      await onVerified(r);
    } catch (e) {
      setErr(e as ApiError);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const onCode = (v: string) => {
    setCode(v);
    if (err) setErr(null);
    if (v.length === 4) verify(v);
  };

  const submitPhone = (e: FormEvent) => { e.preventDefault(); if (digits.length === 9) send(); };
  const errText = err && (err.field("code") || err.field("phone") || err.message);

  if (step === "link") {
    return (
      <div className="col gap-16">
        <div className="tg-card">
          <div className="tg-icon"><Send size={30} /></div>
          <div className="h3">Telegram botni ulang</div>
          <p className="small muted" style={{ marginTop: 6, lineHeight: 1.55 }}>
            Kodlar Telegram orqali keladi. Botni oching va <b>«📱 Raqamni ulashish»</b> tugmasini bosing — bu bir martalik amal.
          </p>
          {link?.url ? (
            <a className="btn btn-telegram btn-lg btn-block auth-btn" style={{ marginTop: 16 }} href={link.url} target="_blank" rel="noreferrer"><Send />Telegram botni ochish</a>
          ) : <Alert tone="warn">Bot manzilini aniqlab bo'lmadi. Birozdan keyin qayta urinib ko'ring.</Alert>}
        </div>
        <div className="row center gap-8 small muted"><Loader2 className="spin" size={16} />Raqam ulanishini kutyapmiz… (+998 {fmt(digits)})</div>
        {errText && <Alert tone="error">{errText}</Alert>}
        <Button variant="ghost" icon={<Pencil />} onClick={() => { setLink(null); setStep("phone"); }}>Raqamni o'zgartirish</Button>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="col gap-16">
        <div style={{ textAlign: "center" }}>
          <div className="tg-icon" style={{ width: 56, height: 56 }}><MessageCircle size={26} /></div>
          <div className="h3">Kodni kiriting</div>
          <p className="small muted mt-4">4 xonali kod Telegram botga yuborildi<br /><b style={{ color: "var(--text)" }}>+998 {fmt(digits)}</b></p>
        </div>
        <OtpBoxes value={code} onChange={onCode} error={!!err} disabled={busy} />
        {busy && <div className="row center gap-8 small muted"><Loader2 className="spin" size={16} />Tekshirilmoqda…</div>}
        {errText && <Alert tone="error">{errText}</Alert>}
        <div className="row between wrap gap-8">
          <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => { setStep("phone"); setErr(null); }}>Raqamni o'zgartirish</Button>
          {resendIn > 0
            ? <span className="small subtle">Qayta yuborish: {resendIn} s</span>
            : <Button variant="ghost" size="sm" onClick={send} loading={busy}>Kodni qayta yuborish</Button>}
        </div>
        {botUrl && <a className="link small" style={{ textAlign: "center" }} href={botUrl} target="_blank" rel="noreferrer">Kod kelmadimi? Telegram botni oching</a>}
      </div>
    );
  }

  return (
    <form className="col gap-16" onSubmit={submitPhone}>
      <div className="field auth-field">
        <label>Telefon raqam</label>
        <PhoneInput value={digits} onChange={setDigits} autoFocus />
      </div>
      {errText && <Alert tone={err?.code === "pending" ? "info" : "error"}>{errText}</Alert>}
      <Button type="submit" size="lg" block className="auth-btn" loading={busy} disabled={digits.length !== 9} icon={<ArrowRight />}>{submitLabel}</Button>
      <p className="tiny subtle" style={{ textAlign: "center" }}>Tasdiqlash kodi Telegram orqali yuboriladi — SMS emas, bepul va tez.</p>
    </form>
  );
}
