import { ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { Logo, NightSchool } from "../../ui/brand";

export interface PublicInfo {
  school: string; logo_url: string | null; splash_url: string | null; has_director: boolean; allow_registration: boolean;
  classes: { id: number; name: string }[]; subjects: { id: number; name: string }[]; google_client_id: string | null; otp: boolean;
}

let cache: Promise<PublicInfo> | null = null;
export function loadPublicInfo(fresh = false) {
  if (!cache || fresh) cache = api<PublicInfo>("public/").catch((e) => { cache = null; throw e; });
  return cache;
}
export function usePublicInfo() {
  const [info, setInfo] = useState<PublicInfo | null>(null);
  useEffect(() => { loadPublicInfo().then(setInfo).catch(() => {}); }, []);
  return info;
}

/** Kechki maktab manzarasi: direktor maktab surati yuklagan bo'lsa — o'sha, aks holda illyustratsiya */
export function Scene({ photo }: { photo?: string | null }) {
  return photo ? <img className="scene" src={photo} alt="" /> : <NightSchool className="scene" />;
}

export function Hero({ info }: { info: PublicInfo | null }) {
  return (
    <div className="splash-top">
      <div style={{ display: "inline-flex" }}><Logo size={68} light /></div>
      <div className="tag">Bir maktab — bitta tizim</div>
      <p>{info?.school ? `${info.school}: ` : ""}O'quvchilar, o'qituvchilar va direktor uchun zamonaviy maktab boshqaruv platformasi</p>
    </div>
  );
}

/** Mobil: oq sahifa. Kompyuter: chapda manzara, o'ngda forma. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const info = usePublicInfo();
  return (
    <div className="auth-shell">
      <aside className="auth-side">
        <Scene photo={info?.splash_url} />
        <div className="scene-shade" />
        <Hero info={info} />
      </aside>
      <main className="auth-main">
        <div className="auth-inner">{children}</div>
      </main>
    </div>
  );
}

export function Splash({ leaving }: { leaving: boolean }) {
  const info = usePublicInfo();
  return (
    <div className={`splash ${leaving ? "out" : ""}`} role="status" aria-label="Yuklanmoqda">
      <Scene photo={info?.splash_url} />
      <div className="scene-shade" />
      <Hero info={info} />
      <div className="splash-bottom">
        <div className="splash-bar"><div /></div>
        Yuklanmoqda...
      </div>
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

declare global {
  interface Window { google?: any }
}

let gisLoader: Promise<void> | null = null;
function loadGis() {
  if (!gisLoader) {
    gisLoader = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoader = null; reject(new Error("Google xizmatiga ulanib bo'lmadi")); };
      document.head.appendChild(s);
    });
  }
  return gisLoader;
}

/** Google'ning rasmiy tugmasi (GOOGLE_CLIENT_ID sozlangan bo'lsa). Bosilganda ID token qaytadi. */
export function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadGis().then(() => {
      const g = window.google?.accounts?.id;
      if (!alive || !g || !ref.current) return;
      g.initialize({ client_id: clientId, callback: (r: { credential: string }) => cb.current(r.credential) });
      g.renderButton(ref.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", locale: "uz", logo_alignment: "center", width: Math.min(400, ref.current.offsetWidth || 320) });
    }).catch(() => setFailed(true));
    return () => { alive = false; };
  }, [clientId]);
  if (failed) return <div className="tiny subtle" style={{ textAlign: "center" }}>Google xizmatiga ulanib bo'lmadi</div>;
  return <div ref={ref} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />;
}
