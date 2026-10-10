import { FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, GraduationCap, KeyRound, LogIn, UserRound } from "lucide-react";
import { ApiError } from "../lib/api";
import { homeFor, useAuth } from "../lib/auth";
import { Alert, Button, Field, Input } from "../ui";

export default function Login() {
  const { user, ready, login } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ready && user) return <Navigate to={homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await login(username.trim(), password);
      const next = params.get("next");
      nav(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(u.role), { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="col" style={{ alignItems: "center", textAlign: "center", marginBottom: 28 }}>
          <div className="brand-mark" style={{ width: 64, height: 64, borderRadius: 20 }}><GraduationCap size={34} /></div>
          <h1 className="h1 mt-16">SchoolPro</h1>
          <p className="muted">Maktabingiz bir ilovada: darslar, vazifalar va davomat</p>
        </div>
        <form className="card" style={{ padding: 22 }} onSubmit={submit}>
          <div className="col gap-16">
            <div>
              <h2 className="h2">Tizimga kirish</h2>
              <p className="muted small mt-4">Login va parolni maktab ma'muriyati beradi</p>
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Login yoki telefon">
              <div className="input-icon">
                <UserRound />
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none"
                  autoCorrect="off" spellCheck={false} placeholder="masalan: 998901234567" required autoFocus />
              </div>
            </Field>
            <Field label="Parol">
              <div className="input-icon">
                <KeyRound />
                <Input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" placeholder="••••••••" required style={{ paddingRight: 48 }} />
                <span className="clear">
                  <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? "Yashirish" : "Ko'rsatish"}>
                    {show ? <EyeOff /> : <Eye />}
                  </button>
                </span>
              </div>
            </Field>
            <Button type="submit" size="lg" block loading={busy} icon={<LogIn />}>Kirish</Button>
          </div>
        </form>
        <p className="subtle small" style={{ textAlign: "center", marginTop: 18 }}>
          Parolni unutdingizmi? Sinf rahbari yoki maktab ma'muriyatiga murojaat qiling.
        </p>
      </div>
    </div>
  );
}
