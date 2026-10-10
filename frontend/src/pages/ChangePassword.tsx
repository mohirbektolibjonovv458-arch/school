import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { homeFor, useAuth } from "../lib/auth";
import { Alert, Button, Field, Input } from "../ui";
import { useToast } from "../ui/toast";

export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const { setSession } = useAuth();
  const toast = useToast();
  const [oldPw, setOld] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = pw2.length > 0 && pw !== pw2;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await api("auth/change-password/", { body: { old_password: oldPw, new_password: pw } });
      setSession(d);
      toast("Parol yangilandi");
      onDone?.();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  const strength = [pw.length >= 8, /[A-Z]/.test(pw) && /[a-z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw) || pw.length >= 12].filter(Boolean).length;

  return (
    <form className="col gap-16" onSubmit={submit}>
      {err && !err.errors && <Alert tone="error">{err.message}</Alert>}
      <Field label="Joriy (vaqtinchalik) parol" error={err?.field("old_password")}>
        <Input type="password" value={oldPw} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Field label="Yangi parol" error={err?.field("new_password")} help="Kamida 8 belgi, harf va raqam aralash">
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required minLength={8} />
      </Field>
      {pw && (
        <div className="row gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ flex: 1, height: 5, borderRadius: 5, background: i < strength ? (strength < 2 ? "var(--red)" : strength < 3 ? "var(--amber)" : "var(--green)") : "var(--surface-3)" }} />
          ))}
        </div>
      )}
      <Field label="Yangi parolni takrorlang" error={mismatch ? "Parollar mos emas" : undefined}>
        <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required invalid={mismatch} />
      </Field>
      <Button type="submit" size="lg" block loading={busy} disabled={mismatch || pw.length < 8}>Saqlash</Button>
    </form>
  );
}

export default function ChangePassword({ forced }: { forced?: boolean }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="card" style={{ padding: 22 }}>
          <div className="row gap-12" style={{ marginBottom: 18 }}>
            <div className="stat-icon tone-primary" style={{ width: 48, height: 48, borderRadius: 14 }}><ShieldCheck /></div>
            <div>
              <h2 className="h2">Yangi parol o'rnating</h2>
              <p className="muted small">{forced ? `${user?.first_name || ""}, xavfsizlik uchun vaqtinchalik parolni almashtiring` : "Hisobingizni himoyalang"}</p>
            </div>
          </div>
          <PasswordForm onDone={() => nav(homeFor(user?.role), { replace: true })} />
          {forced && <Button variant="ghost" block className="mt-8" onClick={logout}>Chiqish</Button>}
        </div>
      </div>
    </div>
  );
}
