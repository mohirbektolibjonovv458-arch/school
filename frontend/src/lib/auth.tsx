import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, setLogoutHandler, tokens } from "./api";
import type { Me } from "./types";

interface AuthCtx {
  user: Me | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<Me>;
  logout: () => void;
  setSession: (d: { access: string; refresh: string; user: Me }) => void;
  refreshMe: () => Promise<void>;
  setUser: (u: Me) => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function homeFor(role?: string) {
  if (role === "student") return "/s";
  if (role === "teacher") return "/t";
  if (role === "director" || role === "admin") return "/d";
  return "/login";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setLogoutHandler(() => setUser(null));
    if (!tokens.access && !tokens.refresh) { setReady(true); return; }
    api<Me>("auth/me/")
      .then(setUser)
      .catch(() => tokens.clear())
      .finally(() => setReady(true));
  }, []);

  useEffect(() => { if (user) applyTheme(user.theme); }, [user?.theme]);

  const setSession = useCallback((d: { access: string; refresh: string; user: Me }) => {
    tokens.set(d.access, d.refresh);
    setUser(d.user);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const d = await api<{ access: string; refresh: string; user: Me }>("auth/login/", { body: { username, password } });
    setSession(d);
    return d.user;
  }, [setSession]);

  const refreshMe = useCallback(async () => { setUser(await api<Me>("auth/me/")); }, []);

  return <Ctx.Provider value={{ user, ready, login, logout, setSession, refreshMe, setUser }}>{children}</Ctx.Provider>;
}

export function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
  try { localStorage.setItem("sp-theme", theme); } catch { /* */ }
}
