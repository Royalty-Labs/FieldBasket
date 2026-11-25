import { Marketplace } from "../../components/Marketplace";
import { SERVICE_AREA } from "../../config";

export default function Shop() {
  return (
    <div className="container page-pad">
      <header className="page-head">
        <h1 className="display-2">Marketplace</h1>
        <p className="page-head__lead">Fresh produce from verified farms across {SERVICE_AREA}.</p>
      </header>
      <Marketplace />
    </div>
  );
}
