import { Link } from "react-router-dom";
import { ChevronRight, LogOut, UserRound } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { ROLE_LABEL } from "../../lib/format";
import { Avatar, Button } from "../../ui";
import { navFor, Page, useCounts } from "../../ui/Shell";

export default function Menu() {
  const { user, logout } = useAuth();
  const { counts } = useCounts();
  const nav = navFor(user?.role);
  return (
    <Page title="Menyu">
      <Link to="/profile" className="card hover row" style={{ marginBottom: 8 }}>
        <Avatar name={user?.full_name || ""} url={user?.avatar_url} size={54} />
        <div className="grow">
          <div className="h3 ellipsis">{user?.full_name}</div>
          <div className="muted small">{ROLE_LABEL[user?.role || ""]}{user?.student?.class_name ? ` · ${user.student.class_name} sinf` : ""}</div>
        </div>
        <ChevronRight className="chev" />
      </Link>
      {nav.groups.map((g) => (
        <div key={g.title}>
          <div className="nav-group" style={{ padding: "18px 4px 8px" }}>{g.title}</div>
          <div className="card pad-0">
            {g.items.map((i) => {
              const n = i.badge ? counts[i.badge] : 0;
              return (
                <Link key={i.to} to={i.to} className="list-item">
                  <div className="stat-icon tone-primary" style={{ width: 38, height: 38, borderRadius: 11 }}><i.icon /></div>
                  <div className="grow bold">{i.label}</div>
                  {n > 0 && <span className="count-badge">{n}</span>}
                  <ChevronRight className="chev" size={20} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="card pad-0 mt-16">
        <Link to="/profile" className="list-item">
          <div className="stat-icon tone-gray" style={{ width: 38, height: 38, borderRadius: 11 }}><UserRound /></div>
          <div className="grow bold">Profil va sozlamalar</div>
          <ChevronRight className="chev" size={20} />
        </Link>
      </div>
      <Button variant="danger-soft" block className="mt-16" icon={<LogOut />} onClick={logout}>Chiqish</Button>
      <p className="subtle tiny" style={{ textAlign: "center", marginTop: 16 }}>SchoolPro · v1.0</p>
    </Page>
  );
}
