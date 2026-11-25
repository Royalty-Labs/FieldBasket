import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../auth/useAuth";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";

const LINKS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/admin", label: "Farmer applications", icon: "farm", end: true },
  { to: "/admin/orders", label: "Orders & refunds", icon: "receipt" },
  { to: "/admin/delivery", label: "Delivery areas", icon: "truck" },
];

export function AdminShell() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="admin">
      <aside className="admin__side">
        <div className="admin__brand">
          <Logo size={26} />
          <span className="admin__badge">Admin</span>
        </div>
        <nav aria-label="Admin" className="admin__nav">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `admin__link${isActive ? " is-active" : ""}`}
            >
              <Icon name={link.icon} size={18} /> {link.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="admin__link admin__signout"
          onClick={() => {
            signOut();
            navigate("/", { replace: true });
          }}
        >
          <Icon name="logout" size={18} /> Sign out
        </button>
      </aside>
      <main className="admin__main">
        <Outlet />
      </main>
    </div>
  );
}
