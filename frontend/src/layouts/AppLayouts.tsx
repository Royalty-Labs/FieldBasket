import { NavLink, Outlet, useNavigate } from "react-router";
import { RequireRole } from "../auth/RequireRole";
import { useAuth } from "../auth/useAuth";
import { Icon, type IconName } from "../components/Icon";

type NavItem = { to: string; label: string; icon: IconName; end?: boolean };

function BottomNav({ items, label }: { items: NavItem[]; label: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  function handleSignOut() {
    signOut();
    navigate("/", { replace: true });
  }

  return (
    <nav className="bottom-nav" aria-label={label}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bottom-nav__item${isActive ? " is-active" : ""}`}
        >
          <Icon name={item.icon} />
          {item.label}
        </NavLink>
      ))}

      {user && (
        <button
          type="button"
          className="bottom-nav__item bottom-nav__signout"
          onClick={handleSignOut}
        >
          <Icon name="logout" />
          Sign out
        </button>
      )}
    </nav>
  );
}

const FARMER_NAV: NavItem[] = [
  { to: "/farm", label: "Overview", icon: "chart", end: true },
  { to: "/farm/orders", label: "Orders", icon: "receipt" },
  { to: "/farm/listings", label: "Listings", icon: "listings" },
  { to: "/farm/profile", label: "Farm", icon: "farm" },
];

/** Public screens (welcome, sign in) in the phone-width column. */
export function PlainShell() {
  return (
    <div className="app-shell">
      <Outlet />
    </div>
  );
}

export function FarmerShell() {
  return (
    <RequireRole role="farmer">
      <div className="app-shell app-shell--nav">
        <Outlet />
        <BottomNav items={FARMER_NAV} label="Farmer" />
      </div>
    </RequireRole>
  );
}
