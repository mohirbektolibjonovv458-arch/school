import { useState } from "react";
import { Check, GraduationCap, Phone, Presentation, ShieldCheck, UserPlus, X } from "lucide-react";
import { api } from "../../lib/api";
import { fmtDate, relative } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import type { SchoolClass } from "../../lib/types";
import { Alert, Avatar, Badge, Button, Empty, Field, Input, ListSkeleton, Loader, Segment, Select, Sheet } from "../../ui";
import { Page, useCounts } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

interface R {
  id: number; full_name: string; role: string; phone: string; email: string; birth_date: string | null; created_at: string; approval: string; reject_reason: string;
  school_class?: number | null; class_name?: string | null; parent_phone?: string; subject_names?: string[]; position?: string;
}
const ROLE: Record<string, { label: string; tone: string; icon: typeof GraduationCap }> = {
  student: { label: "O'quvchi", tone: "primary", icon: GraduationCap },
  teacher: { label: "O'qituvchi", tone: "green", icon: Presentation },
  admin: { label: "Administrator", tone: "red", icon: ShieldCheck },
};

export default function Requests() {
  const toast = useToast();
  const { refresh } = useCounts();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const state = useApi<R[]>(`registrations/?status=${status}`);
  const classes = useApi<SchoolClass[]>("classes/");
  const [sel, setSel] = useState<R | null>(null);
  const [cls, setCls] = useState("");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = (r: R) => { setSel(r); setCls(r.school_class ? String(r.school_class) : ""); setReason(""); setRejecting(false); };
  const review = async (action: "approve" | "reject") => {
    if (!sel) return;
    setBusy(true);
    try {
      await api(`registrations/${sel.id}/review/`, { body: { action, school_class: cls ? Number(cls) : undefined, reason } });
      toast(action === "approve" ? `${sel.full_name} tasdiqlandi — endi tizimga kira oladi` : "So'rov rad etildi");
      setSel(null);
      state.reload(true);
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Ro'yxatdan o'tish so'rovlari">
      <div className="col gap-12" style={{ maxWidth: 820, margin: "0 auto" }}>
        <Segment value={status} onChange={setStatus} items={[{ value: "pending", label: "Kutilmoqda", count: status === "pending" ? state.data?.length : undefined }, { value: "approved", label: "Tasdiqlangan" }, { value: "rejected", label: "Rad etilgan" }]} />
        {status === "pending" && <p className="small muted">Ilovada o'zi ro'yxatdan o'tgan foydalanuvchilar. Ular siz tasdiqlaguncha tizimga kira olmaydi. Haqiqatan maktabingizga tegishli ekanini tekshiring.</p>}
        <Loader state={state} skeleton={<ListSkeleton rows={4} />}
          empty={(d) => d.length === 0 ? <div className="card"><Empty icon={<UserPlus />} title={status === "pending" ? "Yangi so'rovlar yo'q" : "Ro'yxat bo'sh"} text={status === "pending" ? "Kimdir ro'yxatdan o'tsa, shu yerda va Telegram botda xabar olasiz" : undefined} /></div> : null}>
          {(d) => (
            <div className="card pad-0">
              {d.map((r) => {
                const m = ROLE[r.role] || ROLE.student;
                return (
                  <button key={r.id} className="list-item" onClick={() => open(r)}>
                    <Avatar name={r.full_name} size={44} />
                    <div className="grow">
                      <div className="bold ellipsis">{r.full_name}</div>
                      <div className="row wrap gap-6 mt-4">
                        <Badge tone={m.tone} icon={<m.icon />}>{m.label}</Badge>
                        {r.class_name && <Badge tone="gray">{r.class_name} sinf</Badge>}
                        <span className="tiny subtle">{relative(r.created_at)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Loader>
      </div>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.full_name || ""}
        footer={sel?.approval === "pending" ? (rejecting
          ? <><Button variant="secondary" onClick={() => setRejecting(false)}>Orqaga</Button><Button variant="danger" loading={busy} onClick={() => review("reject")}>Rad etish</Button></>
          : <><Button variant="danger-soft" icon={<X />} onClick={() => setRejecting(true)}>Rad etish</Button><Button variant="success" icon={<Check />} loading={busy} onClick={() => review("approve")}>Tasdiqlash</Button></>) : undefined}>
        {sel && (
          <div className="col gap-12">
            <div className="card flat col gap-8 small" style={{ background: "var(--surface-2)" }}>
              <div className="row between"><span className="muted">Rol</span><b>{ROLE[sel.role]?.label}</b></div>
              <div className="row between"><span className="muted">Telefon</span><a className="link row gap-4" href={`tel:${sel.phone}`}><Phone size={14} />{sel.phone}</a></div>
              {sel.email && <div className="row between"><span className="muted">Email</span><b>{sel.email}</b></div>}
              {sel.birth_date && <div className="row between"><span className="muted">Tug'ilgan sana</span><b>{fmtDate(sel.birth_date, true)}</b></div>}
              {sel.parent_phone && <div className="row between"><span className="muted">Ota-ona telefoni</span><b>{sel.parent_phone}</b></div>}
              {sel.position && <div className="row between"><span className="muted">Lavozim</span><b>{sel.position}</b></div>}
              {!!sel.subject_names?.length && <div className="row between"><span className="muted">Fanlar</span><b>{sel.subject_names.join(", ")}</b></div>}
              <div className="row between"><span className="muted">So'rov vaqti</span><b>{relative(sel.created_at)}</b></div>
            </div>
            {sel.approval === "rejected" && sel.reject_reason && <Alert tone="error">Sabab: {sel.reject_reason}</Alert>}
            {sel.approval === "pending" && sel.role === "student" && !rejecting && (
              <Field label="Sinf (kerak bo'lsa o'zgartiring)">
                <Select value={cls} onChange={(e) => setCls(e.target.value)}>
                  {(classes.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            )}
            {sel.role === "admin" && sel.approval === "pending" && <Alert tone="warn">Administrator maktabning barcha ma'lumotlarini ko'radi va boshqaradi. Faqat ishonchli xodimni tasdiqlang.</Alert>}
            {rejecting && (
              <Field label="Rad etish sababi (foydalanuvchi kirishga uringanda ko'radi)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: bunday o'quvchi maktabda yo'q" autoFocus />
              </Field>
            )}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
