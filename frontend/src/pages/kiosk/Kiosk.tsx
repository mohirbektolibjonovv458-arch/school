import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Delete, Expand, GraduationCap, KeyRound, Loader2, LogOut, ScanFace, Settings2, XCircle } from "lucide-react";
import { averageDescriptor, BlinkDetector, detectFace, faceQuality, loadFaceApi, snapshot, startCamera, stopCamera } from "../../lib/face";
import { Avatar } from "../../ui";

const TOKEN_KEY = "sp-kiosk-token";
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

class KioskError extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s; } }
async function kfetch<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/kiosk/${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Kiosk-Token": getToken() || "" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new KioskError(0, "Internet aloqasi yo'q");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new KioskError(res.status, data.detail || `Xato ${res.status}`);
  return data as T;
}

function beep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220; o.type = "sine";
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.25 : 0.5));
    o.start(); o.stop(ctx.currentTime + 0.55);
    if (ok) { const o2 = ctx.createOscillator(); o2.connect(g); o2.frequency.value = 1320; o2.start(ctx.currentTime + 0.12); o2.stop(ctx.currentTime + 0.3); }
  } catch { /* ovozsiz */ }
}

interface Status { device: string; school: string; logo_url: string | null; require_liveness: boolean; enrolled: number; today: { came: number; expected: number } }
interface Result { ok: boolean; action?: "in" | "out" | "duplicate"; message: string; teacher?: { id: number; full_name: string; avatar_url: string | null }; time?: string; late_minutes?: number; reason?: string }
interface RosterT { id: number; full_name: string; position: string; avatar_url: string | null }

export default function Kiosk() {
  const [token, setToken] = useState(getToken());
  useEffect(() => { document.title = "Kiosk · SchoolPro"; }, []);
  if (!token) return <Pair onPaired={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  return <Station onUnpair={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); }} />;
}

function Pair({ onPaired }: { onPaired: (t: string) => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { onPaired((await kfetch<{ token: string }>("pair/", { code })).token); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="kiosk" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <form onSubmit={submit} className="kiosk-card" style={{ maxWidth: 420 }}>
        <div className="big-icon" style={{ background: "#eef0ff", color: "#4f46e5" }}><ScanFace /></div>
        <h1 className="h2" style={{ color: "#0f1222" }}>Kiosk qurilmasini ulash</h1>
        <p style={{ color: "#4a5068", marginTop: 8 }}>Direktor panelida: <b>Kiosk qurilmalar → Qurilma qo'shish</b>. Chiqqan 8 belgili kodni kiriting.</p>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
          placeholder="XXXXXXXX" autoFocus autoCapitalize="characters" autoComplete="off"
          style={{ marginTop: 20, textAlign: "center", fontSize: 28, letterSpacing: 6, fontWeight: 700, background: "#f5f6fb", color: "#0f1222", borderColor: "#d4d9e6" }} />
        {err && <div style={{ color: "#e11d48", marginTop: 10, fontWeight: 600 }}>{err}</div>}
        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} disabled={code.length !== 8 || busy}>{busy ? <Loader2 className="spin" /> : null}Ulash</button>
      </form>
    </div>
  );
}

type Phase = "loading" | "idle" | "scanning" | "blink" | "sending" | "result" | "pin" | "error";

function Station({ onUnpair }: { onUnpair: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhaseState] = useState<Phase>("loading");
  const phaseRef = useRef<Phase>("loading");
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const [hint, setHint] = useState("Tayyorlanmoqda…");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());
  const [menu, setMenu] = useState(false);
  const statusRef = useRef<Status | null>(null);

  const loadStatus = useCallback(async () => {
    try { const s = await kfetch<Status>("status/"); setStatus(s); statusRef.current = s; }
    catch (e) { if ((e as KioskError).status === 401) onUnpair(); }
  }, [onUnpair]);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { loadStatus(); const t = setInterval(loadStatus, 60000); return () => clearInterval(t); }, [loadStatus]);

  // Ekran o'chib qolmasin
  useEffect(() => {
    let lock: any = null;
    const req = async () => { try { lock = await (navigator as any).wakeLock?.request("screen"); } catch { /* */ } };
    req();
    const v = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", v);
    return () => { document.removeEventListener("visibilitychange", v); lock?.release?.(); };
  }, []);

  const showResult = (r: Result) => {
    setResult(r); setPhase("result"); beep(r.ok && r.action !== "duplicate");
    if (navigator.vibrate) navigator.vibrate(r.ok ? 80 : [60, 60, 60]);
    setTimeout(() => { setResult(null); if (phaseRef.current === "result") setPhase("idle"); loadStatus(); }, r.ok ? 3500 : 3000);
  };

  // Asosiy skan tsikli
  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    let timer = 0;
    const blink = new BlinkDetector();
    let frames: Float32Array[] = [];
    let startedAt = 0;
    let lastBox: any = null;
    (async () => {
      try {
        setHint("Yuzni tanish modeli yuklanmoqda…");
        await loadFaceApi();
        stream = await startCamera(video.current!);
        if (!alive) return;
        setPhase("idle");
        const loop = async () => {
          if (!alive) return;
          const ph = phaseRef.current;
          if (ph === "idle" || ph === "scanning" || ph === "blink") {
            const f = await detectFace(video.current!, 320).catch(() => null);
            if (!alive) return;
            if (!f) {
              if (ph !== "idle") { setPhase("idle"); frames = []; blink.reset(); }
              setHint("Kameraga qarang");
            } else {
              const q = faceQuality(f);
              if (!q.ok) { setHint(q.hint); if (ph === "idle") { /* kutamiz */ } }
              else {
                if (ph === "idle") { setPhase("scanning"); frames = []; blink.reset(); startedAt = performance.now(); }
                frames.push(f.descriptor);
                lastBox = f.box;
                const needBlink = statusRef.current?.require_liveness ?? true;
                const blinked = !needBlink || blink.feed(f.ear);
                if (frames.length >= 4 && !blinked) { setPhase("blink"); setHint("Bir marta ko'zingizni yumib-oching"); }
                else setHint("Tekshirilmoqda…");
                if (frames.length >= 4 && blinked) {
                  setPhase("sending");
                  const photo = snapshot(video.current!, lastBox);
                  const descriptor = averageDescriptor(frames.slice(-6));
                  frames = []; blink.reset();
                  kfetch<Result>("identify/", { descriptor, liveness: blinked, photo })
                    .then(showResult)
                    .catch((e) => { if ((e as KioskError).status === 401) onUnpair(); else showResult({ ok: false, message: (e as Error).message }); });
                } else if (performance.now() - startedAt > 8000) {
                  setPhase("idle"); frames = []; blink.reset();
                  setHint(needBlink ? "Ko'zni yumib-ochish aniqlanmadi. Qayta urining" : "Qayta urining");
                }
              }
            }
          }
          timer = window.setTimeout(loop, phaseRef.current === "idle" ? 250 : 120);
        };
        loop();
      } catch (e) {
        setError((e as Error).message || "Kamera yoki model yuklanmadi");
        setPhase("error");
      }
    })();
    return () => { alive = false; clearTimeout(timer); stopCamera(stream); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fullscreen = () => { document.documentElement.requestFullscreen?.().catch(() => {}); setMenu(false); };
  const oval = phase === "scanning" || phase === "blink" || phase === "sending" ? "detecting" : phase === "result" ? (result?.ok ? "ok" : "fail") : "";
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="kiosk">
      <video ref={video} playsInline muted />
      <div className="shade" />
      {phase !== "pin" && phase !== "error" && <div className={`kiosk-oval ${oval}`} />}
      <div className="kiosk-top">
        <div className="brand-mark" style={{ width: 44, height: 44, borderRadius: 14, overflow: "hidden" }}>{status?.logo_url ? <img src={status.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GraduationCap size={24} />}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold ellipsis">{status?.school || "SchoolPro"}</div>
          <div className="small" style={{ opacity: 0.75 }}>{status ? `Bugun keldi: ${status.today.came} / ${status.today.expected}` : "…"}</div>
        </div>
        <div className="kiosk-clock">{time}</div>
        <button className="icon-btn" style={{ color: "#fff" }} onClick={() => setMenu(!menu)} aria-label="Sozlamalar"><Settings2 /></button>
      </div>
      {menu && (
        <div style={{ position: "absolute", top: 86, right: 16, zIndex: 10, background: "#fff", color: "#0f1222", borderRadius: 16, padding: 8, boxShadow: "0 20px 50px rgba(0,0,0,.4)", minWidth: 220 }}>
          <button className="btn btn-ghost btn-block" style={{ justifyContent: "flex-start", color: "#0f1222" }} onClick={fullscreen}><Expand />To'liq ekran</button>
          <button className="btn btn-ghost btn-block" style={{ justifyContent: "flex-start", color: "#e11d48" }} onClick={() => { if (confirm("Qurilmani uzasizmi? Qayta ulash uchun yangi kod kerak bo'ladi.")) onUnpair(); }}><LogOut />Qurilmani uzish</button>
          <div className="tiny" style={{ padding: "6px 12px", color: "#8389a3" }}>{status?.device}</div>
        </div>
      )}

      {phase === "error" && (
        <div className="kiosk-result"><div className="kiosk-card">
          <div className="big-icon" style={{ background: "#fff5e1", color: "#d97706" }}><AlertTriangle /></div>
          <div className="h3">{error}</div>
          <p className="small" style={{ color: "#4a5068", marginTop: 8 }}>PIN-kod orqali belgilanishingiz mumkin.</p>
          <div className="row gap-8 mt-16"><button className="btn btn-secondary grow" onClick={() => location.reload()}>Qayta yuklash</button><button className="btn btn-primary grow" onClick={() => setPhase("pin")}><KeyRound />PIN</button></div>
        </div></div>
      )}

      {phase === "result" && result && <ResultCard r={result} />}
      {phase === "pin" && <PinMode onDone={(r) => showResult(r)} onBack={() => setPhase(error ? "error" : "idle")} onUnauthorized={onUnpair} />}

      {phase !== "pin" && phase !== "error" && (
        <div className="kiosk-bottom">
          <div className="kiosk-hint">
            {phase === "loading" ? <span className="row gap-8"><Loader2 className="spin" />{hint}</span> : phase === "sending" ? <span className="row gap-8"><Loader2 className="spin" />Aniqlanmoqda…</span> : hint}
          </div>
          {status && status.enrolled === 0 && phase === "idle" && <div className="small" style={{ opacity: 0.8, textAlign: "center" }}>Hali hech kim yuz orqali ro'yxatdan o'tmagan — PIN-koddan foydalaning</div>}
          <button className="btn" onClick={() => setPhase("pin")} style={{ background: "rgba(255,255,255,.14)", color: "#fff", backdropFilter: "blur(10px)" }}><KeyRound />PIN-kod bilan belgilanish</button>
        </div>
      )}
    </div>
  );
}

function ResultCard({ r }: { r: Result }) {
  const ok = r.ok && r.action !== "duplicate";
  const tone = !r.ok ? { bg: "#ffe9ee", fg: "#e11d48", icon: <XCircle /> } : r.action === "duplicate" ? { bg: "#e8f0ff", fg: "#2563eb", icon: <CheckCircle2 /> } : r.late_minutes ? { bg: "#fff5e1", fg: "#d97706", icon: <CheckCircle2 /> } : { bg: "#e7f8f1", fg: "#059669", icon: <CheckCircle2 /> };
  return (
    <div className="kiosk-result">
      <div className="kiosk-card">
        {r.teacher ? <div style={{ position: "relative", width: 96, margin: "0 auto 14px" }}><Avatar name={r.teacher.full_name} url={r.teacher.avatar_url} size={96} /><span style={{ position: "absolute", right: -6, bottom: -6, width: 38, height: 38, borderRadius: 19, background: tone.fg, color: "#fff", display: "grid", placeItems: "center", border: "3px solid #fff" }}>{tone.icon}</span></div>
          : <div className="big-icon" style={{ background: tone.bg, color: tone.fg }}>{tone.icon}</div>}
        {r.teacher && <div className="h2" style={{ color: "#0f1222" }}>{r.teacher.full_name}</div>}
        <div className="h3" style={{ color: tone.fg, marginTop: 6 }}>{r.message}</div>
        {ok && <div style={{ fontSize: 44, fontWeight: 800, color: "#0f1222", marginTop: 8, letterSpacing: "-0.02em" }}>{r.time}</div>}
        {ok && <div style={{ color: "#4a5068", fontWeight: 600 }}>{r.action === "in" ? "Kelish vaqti qayd etildi" : "Ketish vaqti qayd etildi"}</div>}
        {!!r.late_minutes && <div className="badge amber" style={{ marginTop: 10, height: 30, fontSize: 14 }}>{r.late_minutes} daqiqa kechikish</div>}
        {r.action === "duplicate" && <div style={{ color: "#4a5068", marginTop: 6 }}>Kelish: {r.time}</div>}
      </div>
    </div>
  );
}

function PinMode({ onDone, onBack, onUnauthorized }: { onDone: (r: Result) => void; onBack: () => void; onUnauthorized: () => void }) {
  const [roster, setRoster] = useState<RosterT[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<RosterT | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { kfetch<RosterT[]>("roster/").then(setRoster).catch((e) => { if (e.status === 401) onUnauthorized(); else setErr(e.message); }); }, [onUnauthorized]);
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    const t = setTimeout(() => backRef.current(), 60000); // 1 daqiqa harakatsizlikda kameraga qaytadi
    return () => clearTimeout(t);
  }, [sel, pin, q]);
  const press = (d: string) => { setErr(""); setPin((p) => (p.length < 6 ? p + d : p)); };
  const submit = async () => {
    if (!sel || pin.length < 4) return;
    setBusy(true);
    try { onDone(await kfetch<Result>("pin/", { teacher: sel.id, pin })); }
    catch (e) { setErr((e as Error).message); setPin(""); setShake(true); setTimeout(() => setShake(false), 450); beep(false); }
    finally { setBusy(false); }
  };
  const list = (roster || []).filter((t) => t.full_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="kiosk-result" style={{ background: "rgba(5,6,15,.92)", alignItems: "stretch", placeItems: "stretch", overflowY: "auto", paddingTop: 96 }}>
      <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <button className="btn" onClick={sel ? () => { setSel(null); setPin(""); setErr(""); } : onBack} style={{ alignSelf: "flex-start", background: "rgba(255,255,255,.12)", color: "#fff" }}><ArrowLeft />{sel ? "Boshqa odam" : "Kameraga qaytish"}</button>
        {!sel ? (
          <>
            <div className="h2">Ismingizni tanlang</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Familiya bo'yicha qidirish" style={{ background: "rgba(255,255,255,.1)", color: "#fff", borderColor: "rgba(255,255,255,.2)" }} />
            {err && <div style={{ color: "#fb7185" }}>{err}</div>}
            {roster === null ? <Loader2 className="spin" /> : list.length === 0 ? <div style={{ opacity: 0.7 }}>PIN o'rnatgan o'qituvchi topilmadi. PIN-kod ilovada «Yuz orqali kirish» bo'limida o'rnatiladi.</div> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                {list.map((t) => (
                  <button key={t.id} onClick={() => setSel(t)} style={{ background: "rgba(255,255,255,.08)", border: 0, borderRadius: 18, padding: 14, color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <Avatar name={t.full_name} url={t.avatar_url} size={56} />
                    <span className="small bold" style={{ textAlign: "center", lineHeight: 1.25 }}>{t.full_name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="col" style={{ alignItems: "center" }}>
            <Avatar name={sel.full_name} url={sel.avatar_url} size={72} />
            <div className="h3 mt-8">{sel.full_name}</div>
            <div className="small" style={{ opacity: 0.7 }}>PIN-kodni kiriting</div>
            <div className={`pin-dots ${shake ? "shake" : ""}`}>{Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <i key={i} className={i < pin.length ? "on" : ""} />)}</div>
            {err && <div style={{ color: "#fb7185", marginBottom: 10, textAlign: "center" }}>{err}</div>}
            <div className="pinpad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
              <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="O'chirish"><Delete style={{ margin: "0 auto" }} /></button>
              <button onClick={() => press("0")}>0</button>
              <button onClick={submit} disabled={pin.length < 4 || busy} style={{ background: pin.length >= 4 ? "#4f46e5" : undefined, fontSize: 18 }}>{busy ? <Loader2 className="spin" style={{ margin: "0 auto" }} /> : "OK"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
