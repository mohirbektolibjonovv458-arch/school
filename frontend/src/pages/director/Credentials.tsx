import { Copy, KeyRound, Share2 } from "lucide-react";
import { Alert, Button, Mono, Sheet } from "../../ui";
import { useToast } from "../../ui/toast";

/** Yangi akkaunt yoki tiklangan parol: bir marta ko'rsatiladi */
export default function Credentials({ data, onClose }: { data: { name: string; username: string; password: string } | null; onClose: () => void }) {
  const toast = useToast();
  const text = data ? `SchoolPro\n${data.name}\nManzil: ${location.origin}\nLogin: ${data.username}\nVaqtinchalik parol: ${data.password}\n(Birinchi kirishda parolni almashtiring)` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast("Nusxalandi"); } catch { toast("Nusxalab bo'lmadi", "error"); }
  };
  const share = async () => {
    try { await navigator.share({ title: "SchoolPro", text }); } catch { /* bekor qilindi */ }
  };
  return (
    <Sheet open={!!data} onClose={onClose} title="Kirish ma'lumotlari"
      footer={<>{"share" in navigator && <Button variant="secondary" icon={<Share2 />} onClick={share}>Ulashish</Button>}<Button icon={<Copy />} onClick={copy}>Nusxalash</Button></>}>
      {data && (
        <div className="col gap-16">
          <div className="row gap-12"><div className="stat-icon tone-primary" style={{ width: 44, height: 44 }}><KeyRound /></div><div className="h3">{data.name}</div></div>
          <div className="card flat col gap-12" style={{ background: "var(--surface-2)" }}>
            <div className="row between"><span className="muted">Login</span><Mono>{data.username}</Mono></div>
            <div className="row between"><span className="muted">Parol</span><Mono>{data.password}</Mono></div>
          </div>
          <Alert tone="warn">Parol faqat hozir ko'rinadi. Nusxalab, egasiga xavfsiz yo'l bilan yetkazing. Birinchi kirishda u parolni almashtiradi.</Alert>
        </div>
      )}
    </Sheet>
  );
}
