import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, KeyRound, Lock, ScanFace, ShieldCheck, X } from "lucide-react";
import { api } from "../../lib/api";
import { relative } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { Alert, Avatar, Badge, Button, Empty, Field, Input, Loader, Segment, Sheet } from "../../ui";
import { Page, useCounts } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

interface E { id: number; teacher: { id: number; full_name: string; avatar_url: string | null }; status: string; samples: number; created_at: string; photo_url: string | null; reviewed_by: string | null; reject_reason: string }
interface D { items: E[]; teachers: { id: number; full_name: string; avatar_url: string | null; consent: boolean; approved: boolean; pending: boolean; pin_set: boolean }[] }

export default function Biometrics() {
  const toast = useToast();
  const { refresh } = useCounts();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const state = useApi<D>("attendance/enrollments/?status=pending");
  const [reject, setReject] = useState<E | null>(null);
  const [reason, setReason] = useState("");
  const review = async (e: E, action: "approve" | "reject", why?: string) => {
    await api(`attendance/enrollments/${e.id}/review/`, { body: { action, reason: why } });
    toast(action === "approve" ? `${e.teacher.full_name}: yuz orqali davomat yoqildi` : "Rad etildi, o'qituvchiga xabar yuborildi");
    setReject(null); setReason("");
    state.reload(true); refresh();
  };
  return (
    <Page title="Biometrika">
      <div className="col gap-16" style={{ maxWidth: 900, margin: "0 auto" }}>
        <Alert tone="info" icon={<ShieldCheck />}>
          <b>Ma'lumotlar himoyasi.</b> Yuz rasmlari emas, faqat shifrlangan raqamli namunalar saqlanadi. Har bir o'qituvchi ilovada yozma rozilik beradi va istalgan vaqtda qaytarib olishi mumkin — namunalar shu zahoti o'chadi. Tasdiqlash uchun bitta kichik surat saqlanadi; kirishdagi suratlar sozlamalardagi muddatdan keyin avtomatik o'chiriladi.
        </Alert>
        <Segment value={tab} onChange={setTab} items={[{ value: "pending", label: "Tasdiq kutayotganlar", count: state.data?.items.length }, { value: "all", label: "Barcha o'qituvchilar" }]} />
        <Loader state={state}>
          {(d) => tab === "pending" ? (
            d.items.length === 0 ? <div className="card"><Empty icon={<ScanFace />} title="Tasdiq kutayotgan namuna yo'q" text="O'qituvchilar ilovada yuzini ro'yxatdan o'tkazgach shu yerda paydo bo'ladi" /></div> : (
              <div className="grid-auto">
                {d.items.map((e) => (
                  <div key={e.id} className="card col gap-12">
                    <div className="row gap-12">
                      {e.photo_url ? <img src={e.photo_url} alt="" style={{ width: 84, height: 104, objectFit: "cover", borderRadius: 16 }} /> : <Avatar name={e.teacher.full_name} size={84} />}
                      <div className="grow">
                        <Link to={`/d/teachers/${e.teacher.id}`} className="bold">{e.teacher.full_name}</Link>
                        <div className="small muted">{e.samples} ta namuna · {relative(e.created_at)}</div>
                        <div className="tiny subtle mt-4">Suratdagi odam haqiqatan shu o'qituvchi ekanini tekshiring.</div>
                      </div>
                    </div>
                    <div className="grid-2">
                      <Button variant="danger-soft" icon={<X />} onClick={() => setReject(e)}>Rad etish</Button>
                      <Button variant="success" icon={<Check />} onClick={() => review(e, "approve")}>Tasdiqlash</Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="card pad-0">
              {d.teachers.map((t) => (
                <Link key={t.id} to={`/d/teachers/${t.id}`} className="list-item">
                  <Avatar name={t.full_name} url={t.avatar_url} size={40} />
                  <div className="grow bold small ellipsis">{t.full_name}</div>
                  <div className="row gap-4 wrap" style={{ justifyContent: "flex-end" }}>
                    {t.approved ? <Badge tone="green" icon={<ScanFace />}>Yuz</Badge> : t.pending ? <Badge tone="amber">Kutmoqda</Badge> : t.consent ? <Badge tone="blue">Rozilik</Badge> : <Badge tone="gray" icon={<Lock />}>Yo'q</Badge>}
                    {t.pin_set && <Badge tone="gray" icon={<KeyRound />}>PIN</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Loader>
      </div>
      <Sheet open={!!reject} onClose={() => setReject(null)} title="Rad etish sababi" footer={<><Button variant="secondary" onClick={() => setReject(null)}>Bekor qilish</Button><Button variant="danger" onClick={() => reject && review(reject, "reject", reason)}>Rad etish</Button></>}>
        <Field label="Sabab (o'qituvchiga yuboriladi)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Surat qorong'i / boshqa odam" /></Field>
      </Sheet>
    </Page>
  );
}

