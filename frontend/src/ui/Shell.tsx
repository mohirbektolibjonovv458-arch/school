import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, BookOpen, BarChart3, CalendarDays, ClipboardCheck, Cog, FileClock, GraduationCap, Home, LayoutGrid, Megaphone,
  ScanFace, School, Smartphone, Star, Users, Clock3, Send,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useInterval } from "../lib/hooks";
import { Avatar, BackButton, IconButton } from "./index";

type Item = { to: string; label: string; icon: typeof Home; end?: boolean; badge?: "unread" | "review" | "faces" };
type Nav = { tabs: Item[]; groups: { title: string; items: Item[] }[] };

const STUDENT: Nav = {
  tabs: [
    { to: "/s", label: "Bosh sahifa", icon: Home, end: true },
    { to: "/s/schedule", label: "Jadval", icon: CalendarDays },
    { to: "/s/homework", label: "Vazifalar", icon: ClipboardCheck },
    { to: "/announcements", label: "E'lonlar", icon: Megaphone },
    { to: "/menu", label: "Menyu", icon: LayoutGrid },
  ],
  groups: [
    { title: "O'qish", items: [
      { to: "/s", label: "Bosh sahifa", icon: Home, end: true },
      { to: "/s/schedule", label: "Dars jadvali", icon: CalendarDays },
      { to: "/s/homework", label: "Uy vazifalari", icon: ClipboardCheck },
      { to: "/s/subjects", label: "Fanlar va o'qituvchilar", icon: BookOpen },
      { to: "/s/grades", label: "Baholarim", icon: Star },
    ] },
    { title: "Maktab", items: [
      { to: "/announcements", label: "E'lonlar", icon: Megaphone },
      { to: "/calendar", label: "Taqvim", icon: CalendarDays },
      { to: "/notifications", label: "Bildirishnomalar", icon: Bell, badge: "unread" },
    ] },
  ],
};

const TEACHER: Nav = {
  tabs: [
    { to: "/t", label: "Bosh sahifa", icon: Home, end: true },
    { to: "/t/classes", label: "Sinflar", icon: Users },
    { to: "/t/homework", label: "Vazifalar", icon: ClipboardCheck, badge: "review" },
    { to: "/t/schedule", label: "Jadval", icon: CalendarDays },
    { to: "/menu", label: "Menyu", icon: LayoutGrid },
  ],
  groups: [
    { title: "Ish stoli", items: [
      { to: "/t", label: "Bosh sahifa", icon: Home, end: true },
      { to: "/t/classes", label: "Sinflarim", icon: Users },
      { to: "/t/homework", label: "Uy vazifalari", icon: ClipboardCheck, badge: "review" },
      { to: "/t/schedule", label: "Dars jadvali", icon: CalendarDays },
    ] },
    { title: "Davomat", items: [
      { to: "/t/attendance", label: "Mening davomatim", icon: Clock3 },
      { to: "/t/face", label: "Yuz orqali kirish", icon: ScanFace },
    ] },
    { title: "Maktab", items: [
      { to: "/announcements", label: "E'lonlar", icon: Megaphone },
      { to: "/calendar", label: "Taqvim", icon: CalendarDays },
      { to: "/notifications", label: "Bildirishnomalar", icon: Bell, badge: "unread" },
    ] },
  ],
};

const DIRECTOR: Nav = {
  tabs: [
    { to: "/d", label: "Bosh sahifa", icon: Home, end: true },
    { to: "/d/attendance", label: "Davomat", icon: Clock3 },
    { to: "/d/classes", label: "Sinflar", icon: School },
    { to: "/d/people", label: "Odamlar", icon: Users },
    { to: "/menu", label: "Menyu", icon: LayoutGrid },
  ],
  groups: [
    { title: "Umumiy", items: [
      { to: "/d", label: "Boshqaruv paneli", icon: Home, end: true },
      { to: "/d/attendance", label: "Davomat", icon: Clock3 },
      { to: "/d/reports", label: "Hisobotlar", icon: BarChart3 },
    ] },
    { title: "Maktab", items: [
      { to: "/d/classes", label: "Sinflar", icon: School },
      { to: "/d/teachers", label: "O'qituvchilar", icon: GraduationCap },
      { to: "/d/students", label: "O'quvchilar", icon: Users },
      { to: "/d/subjects", label: "Fanlar", icon: BookOpen },
      { to: "/d/homework", label: "Uy vazifalari", icon: ClipboardCheck },
    ] },
    { title: "Aloqa", items: [
      { to: "/announcements", label: "E'lonlar", icon: Megaphone },
      { to: "/calendar", label: "Taqvim va yig'ilishlar", icon: CalendarDays },
      { to: "/notifications", label: "Bildirishnomalar", icon: Bell, badge: "unread" },
    ] },
    { title: "Tizim", items: [
      { to: "/d/biometrics", label: "Biometrika", icon: ScanFace, badge: "faces" },
      { to: "/d/devices", label: "Kiosk qurilmalar", icon: Smartphone },
      { to: "/d/telegram", label: "Telegram bot", icon: Send },
      { to: "/d/settings", label: "Sozlamalar", icon: Cog },
      { to: "/d/audit", label: "Amallar tarixi", icon: FileClock },
    ] },
  ],
};

export function navFor(role?: string): Nav {
  if (role === "student") return STUDENT;
  if (role === "teacher") return TEACHER;
  return DIRECTOR;
}

interface Counts { unread: number; review: number; faces: number }
const CountsCtx = createContext<{ counts: Counts; refresh: () => void }>({ counts: { unread: 0, review: 0, faces: 0 }, refresh: () => {} });
export const useCounts = () => useContext(CountsCtx);

export function Shell() {
  const { user } = useAuth();
  const nav = navFor(user?.role);
  const [counts, setCounts] = useState<Counts>({ unread: 0, review: 0, faces: 0 });
  const loc = useLocation();

  const refresh = () => {
    if (document.visibilityState === "hidden") return;
    api<{ count: number }>("notifications/unread-count/").then((r) => setCounts((c) => ({ ...c, unread: r.count }))).catch(() => {});
    if (user?.role === "teacher") api<any>("submissions/?status=submitted&page_size=1").then((r) => setCounts((c) => ({ ...c, review: r.count }))).catch(() => {});
    if (user?.role === "director" || user?.role === "admin") api<any>("attendance/enrollments/?status=pending").then((r) => setCounts((c) => ({ ...c, faces: r.items.length }))).catch(() => {});
  };
  useEffect(() => {
    refresh();
    const h = () => refresh();
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);
  useInterval(refresh, 30000);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <CountsCtx.Provider value={{ counts, refresh }}>
      <div className="app with-sidebar">
        <aside className="sidebar">
          <div className="brand"><div className="brand-mark"><GraduationCap size={20} /></div>SchoolPro</div>
          {nav.groups.map((g) => (
            <div key={g.title}>
              <div className="nav-group">{g.title}</div>
              {g.items.map((i) => <NavItem key={i.to} item={i} counts={counts} />)}
            </div>
          ))}
          <div className="grow" />
          <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} style={{ marginTop: 16 }}>
            <Avatar name={user?.full_name || ""} url={user?.avatar_url} size={30} />
            <div className="grow"><div className="ellipsis bold small">{user?.full_name}</div><div className="tiny subtle">Profil va sozlamalar</div></div>
          </NavLink>
        </aside>
        <Outlet />
        <nav className="tabbar" aria-label="Asosiy menyu">
          {nav.tabs.map((i) => {
            const n = i.badge ? counts[i.badge] : i.to === "/menu" ? counts.unread + counts.faces : 0;
            return (
              <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
                <i.icon />
                {n > 0 && <span className="dot" />}
                <span>{i.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </CountsCtx.Provider>
  );
}

function NavItem({ item, counts }: { item: Item; counts: Counts }) {
  const n = item.badge ? counts[item.badge] : 0;
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
      <item.icon />
      <span className="ellipsis">{item.label}</span>
      {n > 0 && <span className="count-badge badge">{n}</span>}
    </NavLink>
  );
}

/** Har bir sahifa: yuqori panel (sarlavha, orqaga, amallar) + kontent */
export function Page({ title, back, actions, children, noTabbar, hideBell }: {
  title: ReactNode; back?: boolean | string; actions?: ReactNode; children: ReactNode; noTabbar?: boolean; hideBell?: boolean;
}) {
  const { user } = useAuth();
  const { counts } = useCounts();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  useEffect(() => { if (typeof title === "string") document.title = `${title} · SchoolPro`; }, [title]);
  return (
    <>
      <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
        {back && <BackButton to={typeof back === "string" ? back : undefined} />}
        <div className="topbar-title ellipsis">{title}</div>
        {actions}
        {!hideBell && (
          <IconButton label="Bildirishnomalar" badge={counts.unread} onClick={() => navigate("/notifications")}><Bell /></IconButton>
        )}
        {!back && (
          <button className="icon-btn hide-desktop" aria-label="Profil" onClick={() => navigate("/profile")}>
            <Avatar name={user?.full_name || ""} url={user?.avatar_url} size={32} />
          </button>
        )}
      </header>
      <main className={`main ${noTabbar ? "no-tabbar" : ""}`}>{children}</main>
    </>
  );
}

