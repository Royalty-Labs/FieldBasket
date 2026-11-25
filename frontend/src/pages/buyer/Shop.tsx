import { Marketplace } from "../../components/Marketplace";
import { useSiteSettings } from "../../settings/siteSettings";

export default function Shop() {
  const { service_area: area } = useSiteSettings();
  return (
    <div className="container page-pad">
      <header className="page-head">
        <h1 className="display-2">Marketplace</h1>
        <p className="page-head__lead">Fresh produce from verified farms across {area}.</p>
      </header>
      <Marketplace />
    </div>
  );
}
