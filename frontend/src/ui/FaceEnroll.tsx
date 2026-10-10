import { useEffect, useRef, useState } from "react";
import { Loader2, ScanFace } from "lucide-react";
import { BlinkDetector, detectFace, faceQuality, loadFaceApi, snapshot, startCamera, stopCamera, toArray } from "../lib/face";
import { Alert, Button } from "./index";

// turn: 1 — birinchi burilish (istalgan tomonga), 2 — qarama-qarshi tomonga
const STEPS: { hint: string; turn?: 1 | 2; blink?: boolean }[] = [
  { hint: "Kameraga to'g'ri qarang" },
  { hint: "Boshingizni biroz yon tomonga buring", turn: 1 },
  { hint: "Endi boshqa tomonga biroz buring", turn: 2 },
  { hint: "Yana to'g'ri qarang" },
  { hint: "Bir marta ko'z qisib qo'ying", blink: true },
];

function angleOk(step: (typeof STEPS)[number], yaw: number, firstSign: number) {
  const a = Math.abs(yaw);
  if (!step.turn) return a < (step.blink ? 0.2 : 0.12);
  if (a < 0.1 || a > 0.45) return false;
  return step.turn === 1 || Math.sign(yaw) !== firstSign;
}

/** Yuz namunalarini yig'ish: 5 ta turli burchakdagi vektor + bitta tasdiq surati */
export default function FaceEnroll({ onDone, onCancel, busy }: { onDone: (d: { descriptors: number[][]; photo: string }) => void; onCancel: () => void; busy?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"loading" | "capture" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState("Tayyorlanmoqda…");
  const [ok, setOk] = useState(false);
  const data = useRef<{ descriptors: number[][]; photo: string }>({ descriptors: [], photo: "" });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    let timer = 0;
    const blink = new BlinkDetector();
    let current = 0;
    let lastCapture = 0;
    let firstSign = 0;
    (async () => {
      try {
        setHint("Yuzni aniqlash modeli yuklanmoqda…");
        await loadFaceApi();
        stream = await startCamera(video.current!);
        if (!alive) return;
        setPhase("capture");
        const loop = async () => {
          if (!alive) return;
          const f = await detectFace(video.current!).catch(() => null);
          if (!alive) return;
          const s = STEPS[current];
          if (!f) { setOk(false); setHint("Yuz ko'rinmayapti — kameraga qarang"); }
          else {
            const q = faceQuality(f);
            if (!q.ok) { setOk(false); setHint(q.hint); }
            else {
              setHint(s.hint);
              const aOk = angleOk(s, f.yaw, firstSign);
              const blinkOk = !s.blink || blink.feed(f.ear);
              setOk(aOk);
              if (aOk && blinkOk && performance.now() - lastCapture > 600) {
                if (s.turn === 1) firstSign = Math.sign(f.yaw);
                data.current.descriptors.push(toArray(f.descriptor));
                if (current === 0) data.current.photo = snapshot(video.current!, f.box);
                lastCapture = performance.now();
                current += 1;
                setStep(current);
                if (navigator.vibrate) navigator.vibrate(30);
                if (current >= STEPS.length) {
                  setPhase("done");
                  stopCamera(stream);
                  onDone(data.current);
                  return;
                }
              }
            }
          }
          timer = window.setTimeout(loop, 120);
        };
        loop();
      } catch (e) {
        setPhase("error");
        setError((e as Error).message || "Kamera yoki model yuklanmadi");
      }
    })();
    return () => { alive = false; clearTimeout(timer); stopCamera(stream); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "error") {
    return (
      <div className="col gap-12">
        <Alert tone="error">{error}</Alert>
        <Button variant="secondary" onClick={onCancel}>Orqaga</Button>
      </div>
    );
  }

  return (
    <div className="col gap-16">
      <div className="cam">
        <video ref={video} playsInline muted />
        <div className={`oval ${ok ? "ok" : ""}`} />
        {phase === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff" }}>
            <div className="col" style={{ alignItems: "center" }}><Loader2 className="spin" size={32} /><span className="small">{hint}</span></div>
          </div>
        )}
        {phase === "done" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", background: "rgba(0,0,0,.5)" }}>
            <div className="col" style={{ alignItems: "center" }}>{busy ? <Loader2 className="spin" size={36} /> : <ScanFace size={40} />}<span className="bold">{busy ? "Yuborilmoqda…" : "Namunalar olindi"}</span></div>
          </div>
        )}
        {phase === "capture" && <div className="cam-hint">{hint}</div>}
      </div>
      <div className="steps">{STEPS.map((_, i) => <i key={i} className={i < step ? "on" : ""} />)}</div>
      <p className="small muted" style={{ textAlign: "center" }}>Yaxshi yoritilgan joyda turing, ko'zoynak va bosh kiyimni yechib qo'ying.</p>
      {phase !== "done" && <Button variant="ghost" onClick={onCancel}>Bekor qilish</Button>}
    </div>
  );
}
