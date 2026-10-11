/** SchoolPro brend elementlari: logotip, kechki maktab manzarasi, kitoblar illyustratsiyasi (SVG). */
import { useId } from "react";

export function LogoMark({ size = 56, glow = false }: { size?: number; glow?: boolean }) {
  const id = useId().replace(/:/g, "");
  const a = `lma${id}`, b = `lmb${id}`;
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 100 82" fill="none" aria-hidden="true" style={glow ? { filter: "drop-shadow(0 0 14px rgba(90,160,255,.75))" } : undefined}>
      <defs>
        <linearGradient id={a} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3B8BFF" /><stop offset="1" stopColor="#1749C9" /></linearGradient>
        <linearGradient id={b} x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5AA2FF" /><stop offset="1" stopColor="#1D5FE0" /></linearGradient>
      </defs>
      {/* qalpoq */}
      <path d="M50 2 22 14l28 12 28-12L50 2Z" fill="#1D5FE0" />
      <path d="M36 20v8c0 4 6.3 7 14 7s14-3 14-7v-8l-14 6-14-6Z" fill="#1749C9" />
      <path d="M76 15v12" stroke="#1D5FE0" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="76" cy="29" r="3" fill="#1D5FE0" />
      {/* ochiq kitob */}
      <path d="M50 44c-10-7-25-9-40-7v38c15-2 30 0 40 7V44Z" fill={`url(#${a})`} />
      <path d="M50 44c10-7 25-9 40-7v38c-15-2-30 0-40 7V44Z" fill={`url(#${b})`} />
      <path d="M50 44v38" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" />
      <path d="M16 45c11-1 22 1 29 5M16 54c11-1 22 1 29 5M16 63c11-1 22 1 29 5" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      <path d="M84 45c-11-1-22 1-29 5M84 54c-11-1-22 1-29 5M84 63c-11-1-22 1-29 5" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ size = 34, light = false }: { size?: number; light?: boolean }) {
  return (
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: light ? "#fff" : "var(--text)" }}>
      School<span style={{ color: light ? "#7DB4FF" : "var(--primary)" }}>Pro</span>
    </span>
  );
}

export function Logo({ size = 56, light = false, stacked = true }: { size?: number; light?: boolean; stacked?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} glow={light} />
      <Wordmark size={stacked ? size * 0.62 : size * 0.5} light={light} />
    </div>
  );
}

// Yulduzlar — barqaror (har safar bir xil) joylashuv; keng sahna uchun -215..605
const STARS = Array.from({ length: 140 }, (_, i) => {
  const x = ((i * 97.13) % 820) - 215;
  const y = ((i * 53.77) % 430) + 6;
  const r = (i % 7 === 0 ? 1.6 : i % 3 === 0 ? 1.1 : 0.7);
  const o = 0.35 + ((i * 37) % 60) / 100;
  return { x, y, r, o };
});

type Ids = Record<"sky" | "moon" | "win" | "wall" | "wall2" | "ground" | "lamp" | "door" | "glow", string>;

function Windows({ ids, x, y, cols, rows, w = 14, h = 18, gx = 8, gy = 12, lit = 0.8 }: { ids: Ids; x: number; y: number; cols: number; rows: number; w?: number; h?: number; gx?: number; gy?: number; lit?: number }) {
  const out = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const on = ((r * 7 + c * 13 + x) % 10) / 10 < lit;
      out.push(<rect key={`${r}-${c}`} x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx="1.5" fill={on ? `url(#${ids.win})` : "#2b3654"} />);
    }
  return <g filter={`url(#${ids.glow})`}>{out}</g>;
}

function Tree({ x, y, s = 1, c = "#10302c" }: { x: number; y: number; s?: number; c?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="-6" width="6" height="26" fill="#1a1612" />
      <circle cx="0" cy="-22" r="20" fill={c} />
      <circle cx="-14" cy="-10" r="15" fill={c} />
      <circle cx="14" cy="-10" r="15" fill={c} />
      <circle cx="-6" cy="-30" r="12" fill="#163d36" opacity=".8" />
    </g>
  );
}

function Lamp({ ids, x, y }: { ids: Ids; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y - 46} r="26" fill={`url(#${ids.lamp})`} />
      <rect x={x - 1.5} y={y - 44} width="3" height="44" fill="#1b2235" />
      <rect x={x - 5} y={y - 50} width="10" height="7" rx="2" fill="#ffe7a8" />
    </g>
  );
}

/** Kechki maktab binosi manzarasi (splash va kirish sahifasi foni).
 *  Sahna keng chizilgan: telefonda markaz qirqib olinadi, kompyuterda yon tomonlar ham ko'rinadi. */
export function NightSchool({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const u = useId().replace(/:/g, "");
  const ids: Ids = { sky: `s${u}`, moon: `m${u}`, win: `w${u}`, wall: `a${u}`, wall2: `b${u}`, ground: `g${u}`, lamp: `l${u}`, door: `d${u}`, glow: `f${u}` };
  const url = (k: keyof Ids) => `url(#${ids[k]})`;
  return (
    <svg className={className} style={style} viewBox="-215 0 820 844" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#040b1f" />
          <stop offset=".42" stopColor="#0b2253" />
          <stop offset=".68" stopColor="#1d4c93" />
          <stop offset=".8" stopColor="#4a78b8" />
          <stop offset=".86" stopColor="#7f98c4" />
        </linearGradient>
        <radialGradient id={ids.moon} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset=".25" stopColor="#cfe0ff" stopOpacity=".35" /><stop offset="1" stopColor="#cfe0ff" stopOpacity="0" /></radialGradient>
        <linearGradient id={ids.win} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff2c4" /><stop offset="1" stopColor="#ffbe55" /></linearGradient>
        <linearGradient id={ids.wall} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b9a68a" /><stop offset="1" stopColor="#8a7a63" /></linearGradient>
        <linearGradient id={ids.wall2} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a8957a" /><stop offset="1" stopColor="#7a6b57" /></linearGradient>
        <linearGradient id={ids.ground} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a2b46" /><stop offset="1" stopColor="#0a1426" /></linearGradient>
        <radialGradient id={ids.lamp} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffd98a" stopOpacity=".75" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
        <radialGradient id={ids.door} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffd98a" stopOpacity=".55" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
        <filter id={ids.glow} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect x="-215" width="820" height="844" fill={url("sky")} />
      {STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />)}
      <circle cx="318" cy="150" r="70" fill={url("moon")} />
      <circle cx="318" cy="150" r="13" fill="#f4f7ff" />
      {/* uzoqdagi tepaliklar va daraxtlar */}
      <path d="M-215 618c40-20 80-26 118-12 30-18 64-20 92-4 26-16 56-14 60-2 20-18 38-22 55-12 14-20 36-24 52-8 16-14 30-12 44 0l239-6c40-18 80-20 120-6 30-14 60-14 85 2v82H-215Z" fill="#0d2242" opacity=".95" />
      {/* yon qanotlar */}
      <rect x="14" y="602" width="96" height="112" fill={url("wall2")} />
      <path d="M8 604h108l-8-14H16Z" fill="#3a2e28" />
      <rect x="280" y="602" width="96" height="112" fill={url("wall2")} />
      <path d="M274 604h108l-8-14H282Z" fill="#3a2e28" />
      <Windows ids={ids} x={24} y={616} cols={4} rows={3} lit={0.85} />
      <Windows ids={ids} x={290} y={616} cols={4} rows={3} lit={0.8} />
      {/* asosiy bino */}
      <rect x="96" y="566" width="198" height="148" fill={url("wall")} />
      <path d="M88 568h214l-10-16H98Z" fill="#3a2e28" />
      <Windows ids={ids} x={106} y={582} cols={3} rows={4} w={13} h={17} gx={7} gy={11} lit={0.9} />
      <Windows ids={ids} x={232} y={582} cols={3} rows={4} w={13} h={17} gx={7} gy={11} lit={0.85} />
      {/* markaziy minora */}
      <rect x="160" y="520" width="70" height="194" fill="#c2af92" />
      <path d="M152 522h86l-43-34Z" fill="#3a2e28" />
      <path d="M160 522h70l-35-26Z" fill="#cdbb9e" />
      <circle cx="195" cy="510" r="6" fill={url("win")} filter={url("glow")} />
      <rect x="194" y="456" width="2" height="36" fill="#d9dce4" />
      <path d="M196 458h20l-4 6 4 6h-20Z" fill="#1d5fe0" />
      <rect x="166" y="532" width="58" height="16" rx="2" fill="#0e2a5c" />
      <text x="195" y="544" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" letterSpacing="2" fontFamily="Inter, sans-serif">MAKTAB</text>
      <Windows ids={ids} x={170} y={558} cols={3} rows={2} w={10} h={15} gx={8} gy={10} lit={1} />
      {/* kirish */}
      <ellipse cx="195" cy="700" rx="62" ry="26" fill={url("door")} />
      {[168, 182, 208, 222].map((x) => <rect key={x} x={x - 3} y="616" width="6" height="96" fill="#d8c8ab" />)}
      <path d="M180 712v-44a15 15 0 0 1 30 0v44Z" fill={url("win")} filter={url("glow")} />
      <rect x="194.3" y="672" width="1.4" height="40" fill="#b8892f" />
      {/* zinapoya va maydon */}
      <rect x="150" y="712" width="90" height="6" fill="#9a8a72" />
      <rect x="142" y="718" width="106" height="6" fill="#8a7b64" />
      <path d="M-215 724h820v120H-215Z" fill={url("ground")} />
      <path d="M150 724h90l60 120H90Z" fill="#2b3c5c" opacity=".9" />
      <path d="M160 724h70l46 120H114Z" fill="#344a70" opacity=".5" />
      {/* daraxtlar va chiroqlar */}
      <Tree x={-170} y={734} s={1.4} />
      <Tree x={-110} y={744} s={1.05} c="#123a33" />
      <Tree x={-52} y={736} s={1.2} />
      <Tree x={22} y={730} s={1.25} />
      <Tree x={78} y={740} s={0.95} c="#123a33" />
      <Tree x={368} y={732} s={1.3} />
      <Tree x={316} y={742} s={0.9} c="#123a33" />
      <Tree x={440} y={738} s={1.15} />
      <Tree x={500} y={746} s={1} c="#123a33" />
      <Tree x={565} y={734} s={1.4} />
      <Lamp ids={ids} x={128} y={760} />
      <Lamp ids={ids} x={262} y={760} />
      <Lamp ids={ids} x={-10} y={772} />
      <Lamp ids={ids} x={400} y={772} />
      <path d="M-215 792c100-14 260-12 365 4H-215Z" fill="#0b1a12" opacity=".9" />
      <path d="M605 790c-100-14-260-12-365 6h365Z" fill="#0b1a12" opacity=".9" />
    </svg>
  );
}

/** Kitoblar va bitiruvchi qalpog'i (ro'yxatdan o'tish sahifasi). */
export function BooksArt({ width = 220 }: { width?: number }) {
  return (
    <svg width={width} viewBox="0 0 240 150" fill="none" aria-hidden="true">
      <ellipse cx="120" cy="140" rx="100" ry="8" fill="#1d5fe0" opacity=".08" />
      {/* barglar */}
      <path d="M34 136c-6-22 2-40 18-48-2 18-6 34-18 48Z" fill="#7cc48f" />
      <path d="M36 136c-14-14-16-30-8-42 8 12 12 26 8 42Z" fill="#9bd7a9" />
      <path d="M206 136c6-22-2-40-18-48 2 18 6 34 18 48Z" fill="#7cc48f" />
      <path d="M204 136c14-14 16-30 8-42-8 12-12 26-8 42Z" fill="#9bd7a9" />
      {/* kitoblar */}
      <rect x="58" y="112" width="128" height="24" rx="4" fill="#1d5fe0" />
      <rect x="64" y="116" width="116" height="4" rx="2" fill="#fff" opacity=".85" />
      <rect x="64" y="124" width="116" height="4" rx="2" fill="#fff" opacity=".5" />
      <rect x="68" y="90" width="112" height="22" rx="4" fill="#7fb2ff" />
      <rect x="74" y="94" width="100" height="3.5" rx="1.75" fill="#fff" opacity=".9" />
      <rect x="74" y="101" width="100" height="3.5" rx="1.75" fill="#fff" opacity=".6" />
      <rect x="62" y="70" width="118" height="20" rx="4" fill="#0f2f73" />
      <rect x="68" y="74" width="106" height="3.5" rx="1.75" fill="#fff" opacity=".7" />
      <rect x="150" y="70" width="10" height="20" fill="#f5b83d" />
      {/* qalpoq */}
      <path d="M121 22 70 44l51 22 51-22-51-22Z" fill="#0b1f4d" />
      <path d="M95 55v9c0 6 12 10 26 10s26-4 26-10v-9l-26 11-26-11Z" fill="#132c66" />
      <path d="M160 46v18" stroke="#f5b83d" strokeWidth="3" strokeLinecap="round" />
      <path d="M156 64h8l-1 9h-6Z" fill="#f5b83d" />
      <circle cx="121" cy="44" r="3" fill="#f5b83d" />
    </svg>
  );
}
