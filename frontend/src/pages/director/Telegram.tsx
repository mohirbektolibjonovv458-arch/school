import { useState } from "react";
import { BellRing, CheckCircle2, ExternalLink, Send, Unlink } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useApi } from "../../lib/hooks";
import { Alert, Badge, Button, Card, Loader, Mono, Switch } from "../../ui";
import { Page } from "../../ui/Shell";
import { useToast } from "../../ui/toast";

interface T { configured: boolean; linked: boolean; alerts: boolean; bot_username: string | null; code?: string; url?: string | null }

export default function Telegram() {
  const toast = useToast();
  const { refreshMe } = useAuth();
  const state = useApi<T>("telegram/");
  const [link, setLink] = useState<T | null>(null);
  const gen = async () => setLink(await api<T>("telegram/", { method: "POST" }));
  const unlink = async () => { state.setData(await api<T>("telegram/", { method: "DELETE" })); refreshMe(); toast("Bot uzildi"); };
  const alerts = async (v: boolean) => { await api("auth/me/", { method: "PATCH", body: { telegram_alerts: v } }); state.reload(true); };
  return (
    <Page title="Telegram bot">
      <div className="col gap-16" style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="hero">
          <div className="row gap-12" style={{ position: "relative", zIndex: 1 }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center" }}><Send size={28} /></div>
            <div><div className="h3">Direktor boti</div><div className="small muted">Davomat, kechikishlar, hisobotlar va e'lonlar — Telegramda</div></div>
          </div>
        </div>
        <Loader state={state}>
          {(t) => !t.configured ? (
            <Card title="Bot hali sozlanmagan">
              <ol className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>Telegramda <b>@BotFather</b> ga yozing → <Mono>/newbot</Mono> → nom bering.</li>
                <li>Berilgan tokenni server <Mono>backend/.env</Mono> fayliga yozing: <Mono>TELEGRAM_BOT_TOKEN=...</Mono></li>
                <li>Serverni qayta ishga tushiring va shu sahifaga qayting.</li>
              </ol>
            </Card>
          ) : (
            <div className="col gap-16">
              <Card title="Holat" action={t.linked ? <Badge tone="green" icon={<CheckCircle2 />}>Ulangan</Badge> : <Badge tone="amber">Ulanmagan</Badge>}>
                <div className="col gap-12">
                  <div className="small muted">Bot: {t.bot_username ? <a className="link" href={`https://t.me/${t.bot_username}`} target="_blank" rel="noreferrer">@{t.bot_username}</a> : "aniqlanmoqda…"}</div>
                  {t.linked ? (
                    <>
                      <label className="row between"><span className="row gap-8"><BellRing size={18} /><span><b>Avtomatik ogohlantirishlar</b><div className="tiny subtle">Kechikish, kelmaganlar, erta ketish, kunlik yakun</div></span></span><Switch checked={t.alerts} onChange={alerts} /></label>
                      <Button variant="danger-soft" icon={<Unlink />} onClick={unlink}>Botdan uzish</Button>
                    </>
                  ) : link?.url ? (
                    <>
                      <a className="btn btn-primary btn-lg btn-block" href={link.url} target="_blank" rel="noreferrer"><ExternalLink />Telegramda ochish</a>
                      <Alert tone="info">Botda <b>Start</b> ni bosing. Havola 15 daqiqa amal qiladi va faqat siz uchun.</Alert>
                      <Button variant="ghost" onClick={() => state.reload(true)}>Uladim — tekshirish</Button>
                    </>
                  ) : (
                    <Button size="lg" block icon={<Send />} onClick={gen}>Botni ulash</Button>
                  )}
                </div>
              </Card>
              <Card title="Bot imkoniyatlari">
                <div className="col gap-8 small">
                  {[["📊 Bugungi davomat", "kelgan, kechikkan, kelmagan, sababli — bir qarashda"], ["⏰ Kechikkanlar", "kim, qachon va necha daqiqa"], ["❌ Kelmaganlar", "kutilgan vaqti bilan"], ["🏫 Sinflar", "o'quvchilar, o'qituvchilar, bugungi darslar"], ["📈 Hisobot", "kunlik, haftalik, oylik"], ["📢 E'lon yuborish", "botdan yozilgan e'lon ilovada hammaga boradi"]].map(([a, b]) => (
                    <div key={a} className="row-top gap-8"><b style={{ minWidth: 150 }}>{a}</b><span className="muted">{b}</span></div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </Loader>
      </div>
    </Page>
  );
}
