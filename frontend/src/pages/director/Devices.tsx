import { useState } from "react";
import { Copy, MonitorSmartphone, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { relative } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { Alert, Badge, Button, Card, Empty, Field, IconButton, Input, Loader, Mono, Sheet, Switch, useConfirm } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

interface K { id: number; name: string; is_active: boolean; is_paired: boolean; pair_code: string; pair_expires: string | null; last_seen: string | null; created_at: string }

export default function Devices() {
  const toast = useToast();
  const state = useApi<K[]>("attendance/kiosks/");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Asosiy darvoza");
  const [code, setCode] = useState<K | null>(null);
  const { confirm, el } = useConfirm();
  const url = `${location.origin}/kiosk`;
  const create = async () => {
    const k = await api<K>("attendance/kiosks/", { body: { name } });
    setOpen(false); setCode(k); state.reload(true);
  };
  const regen = async (k: K) => {
    if (k.is_paired && !(await confirm("Qayta juftlaysizmi?", { text: "Hozirgi qurilma darhol uziladi." }))) return;
    setCode(await api<K>(`attendance/kiosks/${k.id}/pair-code/`, { method: "POST" }));
    state.reload(true);
  };
  const toggle = async (k: K, v: boolean) => { await api(`attendance/kiosks/${k.id}/`, { method: "PATCH", body: { is_active: v } }); state.reload(true); };
  const del = async (k: K) => {
    if (!(await confirm(`«${k.name}» o'chirilsinmi?`, { danger: true, ok: "O'chirish" }))) return;
    await api(`attendance/kiosks/${k.id}/`, { method: "DELETE" }); state.reload(true);
  };
  const online = (k: K) => k.last_seen && Date.now() - new Date(k.last_seen).getTime() < 3 * 60 * 1000;
  return (
    <Page title="Kiosk qurilmalar">
      <div className="col gap-16" style={{ maxWidth: 820, margin: "0 auto" }}>
        <Card title="Qanday ulanadi?">
          <ol className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Darvoza yoniga old kamerali planshet yoki telefon o'rnating (quvvatga ulangan holda).</li>
            <li>Qurilmada brauzerda oching: <Mono>{url}</Mono></li>
            <li>Bu yerda «Qurilma qo'shish» ni bosing va chiqqan 8 belgili kodni qurilmaga kiriting.</li>
            <li>Tayyor — o'qituvchilar kameraga qarab o'tadi, natija shu zahoti panelda ko'rinadi.</li>
          </ol>
        </Card>
        <Loader state={state} empty={(d) => d.length === 0 ? <Empty icon={<MonitorSmartphone />} title="Qurilmalar yo'q" action={<Button icon={<Plus />} onClick={() => setOpen(true)}>Qurilma qo'shish</Button>} /> : null}>
          {(d) => (
            <div className="card pad-0">
              {d.map((k) => (
                <div key={k.id} className="list-item">
                  <div className={`stat-icon tone-${online(k) ? "green" : "gray"}`} style={{ width: 42, height: 42 }}><MonitorSmartphone /></div>
                  <div className="grow">
                    <div className="bold small">{k.name}</div>
                    <div className="row wrap gap-6 mt-4">
                      {k.is_paired ? <Badge tone={online(k) ? "green" : "gray"}>{online(k) ? "Onlayn" : k.last_seen ? `Oxirgi: ${relative(k.last_seen)}` : "Ulangan"}</Badge> : <Badge tone="amber">Juftlanmagan</Badge>}
                      {!k.is_active && <Badge tone="red">O'chirilgan</Badge>}
                    </div>
                  </div>
                  <Switch checked={k.is_active} onChange={(v) => toggle(k, v)} label="Faol" />
                  <IconButton label="Juftlash kodi" onClick={() => regen(k)}><RefreshCw /></IconButton>
                  <IconButton label="O'chirish" onClick={() => del(k)}><Trash2 /></IconButton>
                </div>
              ))}
            </div>
          )}
        </Loader>
      </div>
      <button className="fab" onClick={() => setOpen(true)}><Plus />Qurilma</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Yangi qurilma" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Bekor qilish</Button><Button disabled={!name.trim()} onClick={create}>Qo'shish</Button></>}>
        <Field label="Nomi"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asosiy darvoza" /></Field>
      </Sheet>
      <Sheet open={!!code} onClose={() => setCode(null)} title="Juftlash kodi">
        {code && (
          <div className="col gap-16" style={{ alignItems: "center", textAlign: "center" }}>
            <p className="muted">Qurilmada <b>{url}</b> ni oching va kodni kiriting:</p>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 8, fontFamily: "ui-monospace, monospace", background: "var(--surface-2)", padding: "14px 22px", borderRadius: 20 }}>{code.pair_code.slice(0, 4)}-{code.pair_code.slice(4)}</div>
            <Button variant="secondary" icon={<Copy />} onClick={() => { navigator.clipboard?.writeText(code.pair_code); toast("Nusxalandi"); }}>Nusxalash</Button>
            <Alert tone="warn">Kod 15 daqiqa amal qiladi va faqat bir marta ishlatiladi.</Alert>
          </div>
        )}
      </Sheet>
      {el}
    </Page>
  );
}
