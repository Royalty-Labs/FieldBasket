import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth/useAuth";
import { Icon } from "../components/Icon";

export default function Account() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <div className="container container--narrow page-pad">
      <header className="page-head">
        <h1 className="display-2">Account</h1>
      </header>
      <div className="stack-lg">
        <dl className="details details--card">
          <div>
            <dt>Name</dt>
            <dd className="details__strong">{user.full_name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Account type</dt>
            <dd className="capitalize">{user.role}</dd>
          </div>
        </dl>
        <div className="account-links">
          <Link to="/orders" className="btn btn--outline">
            <Icon name="receipt" size={18} /> My orders
          </Link>
          <Link to="/basket" className="btn btn--outline">
            <Icon name="basket" size={18} /> My basket
          </Link>
          <button
            className="btn btn--outline"
            onClick={() => {
              signOut();
              navigate("/", { replace: true });
            }}
          >
            <Icon name="logout" size={18} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
