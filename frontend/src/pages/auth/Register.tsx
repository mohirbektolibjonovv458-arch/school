import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Clock3, Eye, EyeOff, GraduationCap, Presentation, ShieldCheck } from "lucide-react";
import { api, ApiError, tokens } from "../../lib/api";
import { homeFor, useAuth } from "../../lib/auth";
import type { Me } from "../../lib/types";
import { Alert, Button, Field, Input, Select } from "../../ui";
import { BooksArt } from "../../ui/brand";
import { AuthLayout, usePublicInfo } from "./shared";
import PhoneOtp from "./PhoneOtp";

type Role = "student" | "teacher" | "director";

const ROLES: { role: Role; title: string; text: string; color: string; icon: typeof GraduationCap }[] = [
  { role: "student", title: "O'quvchi", text: "Darslar, uy vazifalari, baholar va e'lonlar", color: "#1D5FE0", icon: GraduationCap },
  { role: "teacher", title: "O'qituvchi", text: "Sinflar, jadval, vazifalar va o'quvchilar", color: "#16A34A", icon: Presentation },
  { role: "director", title: "Direktor", text: "Barcha maktab boshqaruvi, hisobotlar va statistika", color: "#E5484D", icon: ShieldCheck },
];

export default function Register() {
  const nav = useNavigate();
  const info = usePublicInfo();
  const [role, setRole] = useState<Role | null>(null);
  const [done, setDone] = useState<{ role: string; username: string } | null>(null);
  const [verified, setVerified] = useState<{ phone: string; phone_token: string } | null>(null);
  const otp = !!info?.otp;

  const back = () => (done ? nav("/login") : verified ? setVerified(null) : role ? setRole(null) : nav("/login"));
  const steps = otp ? 4 : 3;
  const step = done ? steps : !role ? 1 : otp ? (verified ? 3 : 2) : 2;

  return (
    <AuthLayout>
      <div className="auth-head">
        <button className="icon-btn" onClick={back} aria-label="Orqaga"><ArrowLeft /></button>
        <div className="t">Ro'yxatdan o'tish</div>
      </div>
      <div className="auth-steps">{Array.from({ length: steps }, (_, i) => i + 1).map((i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>

      {done ? <Done role={done.role} username={done.username} /> : !role ? (
        <>
          <h1 className="auth-title" style={{ textAlign: "left" }}>Avval rolingizni tanlang</h1>
          <p className="auth-sub" style={{ textAlign: "left" }}>Bu maktab tizimida qanday foydalanuvchi sifatida ro'yxatdan o'tmoqchisiz?</p>
          <div className="col gap-12" style={{ marginTop: 22 }}>
            {ROLES.map((r) => (
              <button key={r.role} className="role-card" onClick={() => setRole(r.role)}>
                <span className="ic" style={{ background: r.color, boxShadow: `0 8px 18px color-mix(in srgb, ${r.color} 35%, transparent)` }}><r.icon /></span>
                <span style={{ flex: 1, minWidth: 0, marginTop: 0 }}><b>{r.title}</b><span>{r.text}</span></span>
                <ChevronRight className="chev" size={22} style={{ color: "var(--text-3)" }} />
              </button>
            ))}
          </div>
          <div className="grow" />
          <div style={{ display: "flex", justifyContent: "center", marginTop: 26 }}><BooksArt width={230} /></div>
          <p className="auth-foot">Hisobingiz bormi? <Link to="/login">Kirish</Link></p>
        </>
      ) : otp && !verified ? (
        <>
          <h1 className="auth-title" style={{ textAlign: "left" }}>Telefon raqamingiz</h1>
          <p className="auth-sub" style={{ textAlign: "left" }}>Raqamingizni tasdiqlaymiz — Telegram botga 4 xonali kod keladi. Keyinchalik shu raqam bilan parolsiz kirasiz.</p>
          <div style={{ marginTop: 22 }}><PhoneOtp purpose="register" onVerified={(d) => setVerified(d)} submitLabel="Kod olish" /></div>
        </>
      ) : (
        <RegisterForm role={role} info={info} onPending={setDone} verified={verified} />
      )}
    </AuthLayout>
  );
}

function RegisterForm({ role, info, onPending, verified }: { role: Role; info: ReturnType<typeof usePublicInfo>; onPending: (d: { role: string; username: string }) => void; verified: { phone: string; phone_token: string } | null }) {
  const { setSession } = useAuth();
  const nav = useNavigate();
  const meta = ROLES.find((r) => r.role === role)!;
  const firstDirector = role === "director" && info && !info.has_director;
  const [d, setD] = useState({ last_name: "", first_name: "", middle_name: "", phone: "", email: "", password: "", password2: "", school_class: "", birth_date: "", parent_phone: "", position: "", school_name: "" });
  const [subjects, setSubjects] = useState<number[]>([]);
  const [agree, setAgree] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));
  const mismatch = !verified && d.password2.length > 0 && d.password !== d.password2;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setErr(null);
    try {
      const body = {
        role, first_name: d.first_name, last_name: d.last_name, middle_name: d.middle_name, email: d.email,
        ...(verified ? { phone_token: verified.phone_token } : { phone: d.phone, password: d.password }),
        birth_date: d.birth_date || null, school_class: d.school_class ? Number(d.school_class) : null, parent_phone: d.parent_phone,
        subjects, position: d.position, school_name: d.school_name,
      };
      const r = await api<{ status: string; role: string; username: string; access?: string; refresh?: string; user?: Me }>("auth/register/", { body });
      if (r.status === "active" && r.access && r.refresh && r.user) {
        tokens.remember(true);
        setSession({ access: r.access, refresh: r.refresh, user: r.user });
        nav(homeFor(r.user.role), { replace: true });
      } else {
        onPending({ role: r.role, username: r.username });
      }
    } catch (e2) {
      setErr(e2 as ApiError);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  const noClasses = role === "student" && info && info.classes.length === 0;
  return (
    <form className="col gap-14" onSubmit={submit} style={{ gap: 14 }}>
      <div className="row gap-12">
        <span className="role-card" style={{ padding: 0, border: 0, boxShadow: "none", width: "auto", background: "none", cursor: "default" }}>
          <span className="ic" style={{ background: meta.color, width: 48, height: 48 }}><meta.icon /></span>
        </span>
        <div>
          <h1 className="h2">{meta.title} sifatida</h1>
          <p className="small muted">Ma'lumotlaringizni to'g'ri kiriting</p>
        </div>
      </div>

      {role === "director" && info && (firstDirector
        ? <Alert tone="success">Siz maktabning <b>birinchi direktori</b> sifatida ro'yxatdan o'tasiz va darhol tizimga kirasiz.</Alert>
        : <Alert tone="info">Maktabda direktor allaqachon bor. So'rovingiz <b>administrator (zavuch)</b> sifatida direktor tasdig'iga yuboriladi.</Alert>)}
      {role !== "director" && <Alert tone="info">Ro'yxatdan o'tgach, so'rovingizni maktab ma'muriyati tasdiqlaydi. Shundan keyin tizimga kira olasiz.</Alert>}
      {noClasses && <Alert tone="warn">Maktabda hali sinflar yaratilmagan. Direktor sinflarni qo'shgandan keyin ro'yxatdan o'ting.</Alert>}
      {err && <Alert tone="error">{err.message}</Alert>}

      {firstDirector && (
        <Field label="Maktab nomi" error={err?.field("school_name")}>
          <Input value={d.school_name} onChange={(e) => set("school_name", e.target.value)} placeholder="Masalan: Toshkent shahar 110-maktab" />
        </Field>
      )}
      <div className="form-grid two">
        <Field label="Familiya" error={err?.field("last_name")}><Input value={d.last_name} onChange={(e) => set("last_name", e.target.value)} autoComplete="family-name" required /></Field>
        <Field label="Ism" error={err?.field("first_name")}><Input value={d.first_name} onChange={(e) => set("first_name", e.target.value)} autoComplete="given-name" required /></Field>
      </div>
      <Field label="Otasining ismi (ixtiyoriy)"><Input value={d.middle_name} onChange={(e) => set("middle_name", e.target.value)} /></Field>

      {role === "student" && (
        <div className="form-grid two">
          <Field label="Sinfingiz" error={err?.field("school_class")}>
            <Select value={d.school_class} onChange={(e) => set("school_class", e.target.value)} required>
              <option value="">Tanlang</option>
              {(info?.classes || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Tug'ilgan sana"><Input type="date" value={d.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></Field>
        </div>
      )}
      {role === "teacher" && (
        <>
          <Field label="Lavozim (ixtiyoriy)"><Input value={d.position} onChange={(e) => set("position", e.target.value)} placeholder="Matematika o'qituvchisi" /></Field>
          {!!info?.subjects.length && (
            <Field label="Qaysi fanlardan dars berasiz?">
              <div className="row wrap gap-8">
                {info.subjects.map((s) => {
                  const on = subjects.includes(s.id);
                  return <button type="button" key={s.id} className={`chip ${on ? "active" : ""}`} onClick={() => setSubjects(on ? subjects.filter((x) => x !== s.id) : [...subjects, s.id])}>{on && <Check size={14} />}{s.name}</button>;
                })}
              </div>
            </Field>
          )}
        </>
      )}

      {verified ? (
        <div className="row gap-8 small" style={{ background: "var(--green-soft)", color: "var(--green)", padding: "10px 14px", borderRadius: 12 }}>
          <Check size={18} /><span>Telefon tasdiqlandi: <b>{verified.phone}</b></span>
        </div>
      ) : (
      <Field label="Telefon raqam" error={err?.field("phone")} help="Tizimga kirish uchun login bo'ladi">
        <Input type="tel" inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+998 90 123 45 67" autoComplete="tel" required />
      </Field>
      )}
      {role === "student" && (
        <Field label="Ota-ona telefoni (ixtiyoriy)" error={err?.field("parent_phone")}>
          <Input type="tel" inputMode="tel" value={d.parent_phone} onChange={(e) => set("parent_phone", e.target.value)} placeholder="+998 90 123 45 67" />
        </Field>
      )}
      <Field label="Email (ixtiyoriy)" error={err?.field("email")} help="Email bilan ham kira olasiz">
        <Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} placeholder="ism@misol.uz" autoComplete="email" />
      </Field>
      {!verified && (<>
      <Field label="Parol" error={err?.field("password")} help="Kamida 8 belgi: harf va raqam aralash">
        <div className="auth-input">
          <Input type={show ? "text" : "password"} value={d.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" required minLength={8} style={{ paddingLeft: 14, paddingRight: 52 }} />
          <span className="eye"><button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label="Parolni ko'rsatish">{show ? <EyeOff /> : <Eye />}</button></span>
        </div>
      </Field>
      <Field label="Parolni takrorlang" error={mismatch ? "Parollar mos emas" : undefined}>
        <Input type={show ? "text" : "password"} value={d.password2} onChange={(e) => set("password2", e.target.value)} autoComplete="new-password" required invalid={mismatch} />
      </Field>
      </>)}
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span className="small muted">Shaxsiy ma'lumotlarim maktab tizimida saqlanishi va ishlatilishiga roziman</span>
      </label>
      <Button type="submit" size="lg" block loading={busy} className="auth-btn" disabled={!agree || mismatch || !!noClasses}>
        {firstDirector ? "Ro'yxatdan o'tish va kirish" : "So'rov yuborish"}
      </Button>
      <p className="auth-foot" style={{ marginTop: 4 }}>Hisobingiz bormi? <Link to="/login">Kirish</Link></p>
    </form>
  );
}

function Done({ role, username }: { role: string; username: string }) {
  const label = { student: "o'quvchi", teacher: "o'qituvchi", admin: "administrator" }[role] || "foydalanuvchi";
  return (
    <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 12, marginTop: 24 }}>
      <div style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--primary-soft)", color: "var(--primary)", display: "grid", placeItems: "center" }}><Clock3 size={42} /></div>
      <h1 className="auth-title">So'rovingiz yuborildi!</h1>
      <p className="auth-sub" style={{ maxWidth: 340 }}>
        Siz {label} sifatida ro'yxatdan o'tdingiz. Maktab ma'muriyati ma'lumotlaringizni tekshirib tasdiqlagach, tizimga kira olasiz.
      </p>
      <div className="card flat" style={{ width: "100%", background: "var(--surface-2)", textAlign: "left" }}>
        <div className="small muted">Loginingiz</div>
        <div className="bold" style={{ fontSize: 18 }}>{username}</div>
        <div className="tiny subtle mt-4">Telefon raqamingiz yoki email bilan ham kira olasiz.</div>
      </div>
      <div style={{ marginTop: 8 }}><BooksArt width={180} /></div>
      <Link to="/login" className="btn btn-primary btn-lg btn-block auth-btn">Kirish sahifasiga</Link>
    </div>
  );
}
