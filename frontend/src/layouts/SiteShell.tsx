import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { homePathFor } from "../auth/authContext";
import { useAuth } from "../auth/useAuth";
import { useBasket } from "../basket/useBasket";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { CONTACT_EMAIL, SERVICE_AREA } from "../config";
import { useUi } from "../ui/uiContext";

/** Scroll to #section links, or to the top on a new page. */
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
}

function BasketButton({ className, children }: { className: string; children?: React.ReactNode }) {
  const { user } = useAuth();
  const basket = useBasket();
  const { requireSignIn, showToast } = useUi();
  const navigate = useNavigate();

  function open() {
    if (!user) requireSignIn({ title: "Sign in to see your basket" });
    else if (user.role !== "buyer") showToast("The basket is for buyer accounts.");
    else navigate("/basket");
  }

  return (
    <button type="button" className={className} onClick={open} aria-label={`Basket, ${basket.count} items`}>
      <span className="basket-icon">
        <Icon name="basket" size={21} />
        {basket.count > 0 && (
          <span key={basket.count} className="basket-icon__count">
            {basket.count}
          </span>
        )}
      </span>
      {children}
    </button>
  );
}

function SiteHeader() {
  const { user } = useAuth();

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__logo" aria-label="FieldBasket home">
          <Logo />
        </Link>
        <nav className="site-header__nav" aria-label="Main">
          <NavLink to="/shop">Marketplace</NavLink>
          <Link to="/#how">How it works</Link>
          <Link to="/#farmers">For farmers</Link>
          <Link to="/#trust">How we verify</Link>
        </nav>
        <div className="site-header__actions">
          {(!user || user.role === "buyer") && <BasketButton className="site-header__icon" />}
          {!user && (
            <>
              <Link to="/login" className="site-header__link">
                Sign in
              </Link>
              <Link to="/shop" className="btn btn--lime btn--sm site-header__cta">
                Start shopping
              </Link>
            </>
          )}
          {user?.role === "buyer" && (
            <>
              <NavLink to="/orders" className="site-header__link">
                Orders
              </NavLink>
              <Link to="/account" className="site-header__avatar" aria-label="Your account">
                {user.full_name.trim().charAt(0).toUpperCase()}
              </Link>
            </>
          )}
          {user && user.role !== "buyer" && (
            <Link to={homePathFor(user.role)} className="btn btn--lime btn--sm">
              {user.role === "admin" ? "Admin" : "My farm"}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Logo />
          <p>Fresh food, straight from verified farms across {SERVICE_AREA}.</p>
          {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}
        </div>
        <nav className="site-footer__nav" aria-label="Footer">
          <div>
            <span>Buy</span>
            <Link to="/shop">Marketplace</Link>
            <Link to="/#how">How it works</Link>
          </div>
          <div>
            <span>Sell</span>
            <Link to="/register?role=farmer">Register your farm</Link>
            <Link to="/#trust">How we verify</Link>
          </div>
          <div>
            <span>Help</span>
            <Link to="/#faq">Questions</Link>
            <Link to="/terms">Terms of Use</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </div>
        </nav>
      </div>
      <div className="site-footer__legal">
        © {new Date().getFullYear()} FieldBasket · A Royalty-Labs product · {SERVICE_AREA}, Nigeria
      </div>
    </footer>
  );
}

type TabItem = { to: string; label: string; icon: IconName; end?: boolean };

const TABS: TabItem[] = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/shop", label: "Shop", icon: "grid" },
];

/** App-style tab bar for phones; hidden on wider screens. */
function SiteTabBar() {
  const { user } = useAuth();
  const { requireSignIn } = useUi();
  const isBuyer = user?.role === "buyer";

  return (
    <nav className="tab-bar" aria-label="App">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `tab-bar__item${isActive ? " is-active" : ""}`}>
          <Icon name={tab.icon} />
          {tab.label}
        </NavLink>
      ))}
      {(!user || isBuyer) && (
        <NavLink to="/basket" className={({ isActive }) => `tab-bar__item${isActive ? " is-active" : ""}`} onClick={(event) => {
          if (!user) {
            event.preventDefault();
            requireSignIn({ title: "Sign in to see your basket" });
          }
        }}>
          <BasketIconOnly />
          Basket
        </NavLink>
      )}
      {isBuyer ? (
        <>
          <NavLink to="/orders" className={({ isActive }) => `tab-bar__item${isActive ? " is-active" : ""}`}>
            <Icon name="receipt" />
            Orders
          </NavLink>
          <NavLink to="/account" className={({ isActive }) => `tab-bar__item${isActive ? " is-active" : ""}`}>
            <Icon name="user" />
            Account
          </NavLink>
        </>
      ) : user ? (
        <NavLink to={homePathFor(user.role)} className="tab-bar__item">
          <Icon name="farm" />
          {user.role === "admin" ? "Admin" : "My farm"}
        </NavLink>
      ) : (
        <NavLink to="/login" className={({ isActive }) => `tab-bar__item${isActive ? " is-active" : ""}`}>
          <Icon name="user" />
          Sign in
        </NavLink>
      )}
    </nav>
  );
}

function BasketIconOnly() {
  const basket = useBasket();
  return (
    <span className="basket-icon">
      <Icon name="basket" />
      {basket.count > 0 && (
        <span key={basket.count} className="basket-icon__count">
          {basket.count}
        </span>
      )}
    </span>
  );
}

/** The public website frame: header, page, footer, and a tab bar on phones. */
export function SiteShell() {
  useScrollOnNavigate();
  return (
    <div className="site">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="site-main">
        <Outlet />
      </main>
      <SiteFooter />
      <SiteTabBar />
    </div>
  );
}
