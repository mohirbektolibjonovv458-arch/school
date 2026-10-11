import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Clock3, Eye, EyeOff, KeyRound, LogIn, Phone } from "lucide-react";
import { api, ApiError, tokens } from "../../lib/api";
import { homeFor, useAuth } from "../../lib/auth";
import type { Me } from "../../lib/types";
import { Alert, Button, Field, Input, Sheet } from "../../ui";
import { Logo } from "../../ui/brand";
import { AuthLayout, GoogleButton, usePublicInfo } from "./shared";
import PhoneOtp from "./PhoneOtp";

export default function Login() {
  const { user, ready, login, setSession } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const info = usePublicInfo();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(tokens.remembered);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [forgot, setForgot] = useState(false);
  const [mode, setMode] = useState<"otp" | "password" | null>(null);
  const useOtp = (mode ?? (info?.otp ? "otp" : "password")) === "otp" && !!info?.otp;

  if (ready && user) return <Navigate to={homeFor(user.role)} replace />;

  const go = (u: Me) => {
    const next = params.get("next");
    nav(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(u.role), { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      go(await login(username.trim(), password, remember));
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async (credential: string) => {
    setError(null);
    setBusy(true);
    try {
      tokens.remember(remember);
      const d = await api<{ access: string; refresh: string; user: Me }>("auth/google/", { body: { credential } });
      setSession(d);
      go(d.user);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const pending = error?.code === "pending";

  const onOtp = async (d: { access: string; refresh: string; user: Me }) => {
    tokens.remember(remember);
    setSession(d);
    go(d.user);
  };

  return (
    <AuthLayout>
      <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 22px" }}><Logo size={62} /></div>
      <h1 className="auth-title">Maktab tizimiga xush kelibsiz!</h1>
      <p className="auth-sub">O'z hisobingizga kirish uchun ma'lumotlarni kiriting</p>

      {useOtp ? (
        <div className="col gap-16" style={{ marginTop: 26 }}>
          <PhoneOtp purpose="login" onVerified={onOtp} />
          <label className="check" style={{ alignItems: "center", gap: 8, justifyContent: "center" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 20, height: 20 }} />
            <span className="small bold">Meni eslab qolish</span>
          </label>
          <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setMode("password")}>Login va parol bilan kirish</button>
          {info?.google_client_id && (<><div className="auth-or">Yoki</div><GoogleButton clientId={info.google_client_id} onCredential={onGoogle} /></>)}
        </div>
      ) : (
      <form className="col gap-16" style={{ marginTop: 26 }} onSubmit={submit}>
        {error && (pending
          ? <Alert tone="info" icon={<Clock3 />}><b>Tasdiq kutilmoqda.</b> {error.message}</Alert>
          : <Alert tone="error">{error.message}</Alert>)}
        <Field label="Telefon raqam yoki email" className="auth-field">
          <div className="auth-input">
            <Phone />
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off"
              spellCheck={false} inputMode="email" placeholder="+998 90 123 45 67" required />
          </div>
        </Field>
        <Field label="Parol" className="auth-field">
          <div className="auth-input">
            <KeyRound />
            <Input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="Parolingizni kiriting" required style={{ paddingRight: 52 }} />
            <span className="eye">
              <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </span>
          </div>
        </Field>
        <div className="row between" style={{ marginTop: -4 }}>
          <label className="check" style={{ alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 20, height: 20 }} />
            <span className="small bold">Meni eslab qolish</span>
          </label>
          <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} onClick={() => setForgot(true)}>
            Parolni unutdingizmi?
          </button>
        </div>
        <Button type="submit" size="lg" block loading={busy} icon={<LogIn />} className="auth-btn">Kirish</Button>
        {info?.otp && <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setMode("otp")}>Telegram kod orqali kirish</button>}
        {info?.google_client_id && (
          <>
            <div className="auth-or">Yoki</div>
            <GoogleButton clientId={info.google_client_id} onCredential={onGoogle} />
          </>
        )}
      </form>
      )}

      <div className="grow" />
      {(info?.allow_registration ?? true) && (
        <p className="auth-foot">Hisobingiz yo'qmi? <Link to="/register">Ro'yxatdan o'tish</Link></p>
      )}
      <ForgotSheet open={forgot} onClose={() => setForgot(false)} initial={username} />
    </AuthLayout>
  );
}

function ForgotSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: string }) {
  const [login, setLogin] = useState("");
  useEffect(() => { if (open) setLogin(initial); }, [open, initial]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ detail: string }>("auth/forgot/", { body: { login } });
      setDone(r.detail);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = () => { setDone(null); setErr(null); onClose(); };
  return (
    <Sheet open={open} onClose={close} title="Parolni tiklash"
      footer={done ? <Button block onClick={close}>Tushunarli</Button> : <><Button variant="secondary" onClick={close}>Bekor qilish</Button><Button loading={busy} onClick={submit} disabled={!login.trim()}>So'rov yuborish</Button></>}>
      {done ? (
        <Alert tone="success"><b>So'rov yuborildi.</b> {done} Yangi parol bilan kirgach, uni o'zingizga qulay parolga almashtirasiz.</Alert>
      ) : (
        <div className="col gap-12">
          <p className="muted small">Telegram botga ulangan bo'lsangiz, parolsiz — <b>Telegram kod orqali</b> kiring. Aks holda telefon raqamingiz yoki loginingizni yozing: maktab ma'muriyati xabar oladi va yangi vaqtinchalik parol beradi.</p>
          {err && <Alert tone="error">{err}</Alert>}
          <Field label="Telefon raqam yoki login">
            <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="+998 90 123 45 67" autoFocus />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
