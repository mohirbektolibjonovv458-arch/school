import { useRef, useState } from "react";
import { Camera, KeyRound, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { api, ApiError, upload } from "../../lib/api";
import { applyTheme, useAuth } from "../../lib/auth";
import { fmtDateTime, ROLE_LABEL } from "../../lib/format";
import { compressImage } from "../../lib/image";
import { Avatar, Button, Card, Field, Input, Segment, Sheet } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";
import { PasswordForm } from "../ChangePassword";

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  if (!user) return null;

  const save = async (patch: Record<string, unknown>, msg = "Saqlandi") => {
    setBusy(true);
    setErr(null);
    try {
      setUser(await api("auth/me/", { method: "PATCH", body: patch }));
      toast(msg);
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  const setTheme = (t: string) => { applyTheme(t); save({ theme: t }, "Mavzu o'zgartirildi"); };
  const onAvatar = async (f?: File) => {
    if (!f) return;
    const fd = new FormData();
    fd.append("file", await compressImage(f, 800));
    try { setUser(await upload("auth/avatar/", fd)); toast("Rasm yangilandi"); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Page title="Profil" back>
      <div className="col gap-16" style={{ maxWidth: 640, margin: "0 auto" }}>
        <div className="card col" style={{ alignItems: "center", textAlign: "center", padding: 24 }}>
          <div style={{ position: "relative" }}>
            <Avatar name={user.full_name} url={user.avatar_url} size={96} />
            <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Rasmni o'zgartirish"
              style={{ position: "absolute", right: -4, bottom: -4, background: "var(--primary)", color: "#fff", width: 36, height: 36, borderRadius: 12 }}>
              <Camera size={18} />
            </button>
            <input ref={fileRef} hidden type="file" accept="image/*" onChange={(e) => onAvatar(e.target.files?.[0])} />
          </div>
          <div className="h2 mt-8">{user.full_name}</div>
          <div className="muted">{ROLE_LABEL[user.role]}{user.student?.class_name ? ` · ${user.student.class_name} sinf` : ""}</div>
          <div className="row gap-8 mt-4">
            <span className="badge gray">Login: {user.username}</span>
            {user.avatar_url && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={async () => setUser(await api("auth/avatar/", { method: "DELETE" }))}>Rasmni olib tashlash</Button>}
          </div>
        </div>

        <Card title="Aloqa ma'lumotlari">
          <div className="form-grid two">
            <Field label="Telefon" error={err?.field("phone")}>
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
            </Field>
            <Field label="Email" error={err?.field("email")}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ism@misol.uz" />
            </Field>
          </div>
          <Button className="mt-16" loading={busy} onClick={() => save({ phone, email })} disabled={phone === user.phone && email === user.email}>Saqlash</Button>
        </Card>

        <Card title="Ko'rinish">
          <Segment value={user.theme || "system"} onChange={setTheme} items={[
            { value: "system", label: <span className="row gap-6"><Monitor size={16} />Avto</span> },
            { value: "light", label: <span className="row gap-6"><Sun size={16} />Yorug'</span> },
            { value: "dark", label: <span className="row gap-6"><Moon size={16} />Qorong'i</span> },
          ]} />
        </Card>

        <Card title="Xavfsizlik">
          <div className="row between wrap gap-12">
            <div>
              <div className="bold">Parol</div>
              <div className="small subtle">Oxirgi kirish: {fmtDateTime(user.last_login)}</div>
            </div>
            <Button variant="secondary" icon={<KeyRound />} onClick={() => setPwOpen(true)}>Parolni o'zgartirish</Button>
          </div>
        </Card>

        <Button variant="danger-soft" block icon={<LogOut />} onClick={logout}>Hisobdan chiqish</Button>
      </div>
      <Sheet open={pwOpen} onClose={() => setPwOpen(false)} title="Parolni o'zgartirish">
        <PasswordForm onDone={() => setPwOpen(false)} />
      </Sheet>
    </Page>
  );
}
