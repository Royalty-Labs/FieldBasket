import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import * as api from "../../api/endpoints";
import type { BasketItem } from "../../basket/basketStore";
import { useBasket } from "../../basket/useBasket";
import { EmptyState, Notice } from "../../components/Feedback";
import { TextAreaField } from "../../components/Fields";
import { Icon } from "../../components/Icon";
import { ProductThumb } from "../../components/ProductThumb";
import { naira } from "../../lib/format";
import { errorMessage, useApi } from "../../lib/useApi";
import type { Product } from "../../types";

type Fresh = Record<string, Product | null>;

/** Re-check each basket item against the live listing. */
function useFreshListings(productIds: string[]) {
  const idsKey = productIds.join(",");
  const load = useCallback(async (): Promise<Fresh> => {
    const ids = idsKey ? idsKey.split(",") : [];
    const results = await Promise.allSettled(ids.map((id) => api.getProduct(id)));
    return Object.fromEntries(
      ids.map((id, i) => {
        const result = results[i];
        const product = result.status === "fulfilled" ? result.value : null;
        const live = product && product.is_available && Number(product.quantity_available) > 0 ? product : null;
        return [id, live];
      }),
    );
  }, [idsKey]);
  return useApi(load);
}

export default function Basket() {
  const basket = useBasket();
  const navigate = useNavigate();
  const fresh = useFreshListings(basket.items.map((i) => i.productId));
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lines = useMemo(
    () =>
      basket.items.map((item) => {
        const live = fresh.data?.[item.productId];
        const checked = fresh.data !== undefined;
        const unavailable = checked && !live;
        const price = live ? Number(live.price_per_unit) : item.unitPrice;
        const stock = live ? Number(live.quantity_available) : item.maxQuantity;
        return {
          item,
          price,
          stock,
          unavailable,
          priceChanged: Boolean(live) && price !== item.unitPrice,
          tooMany: Boolean(live) && item.quantity > stock,
        };
      }),
    [basket.items, fresh.data],
  );

  const groups = useMemo(() => {
    const byFarm = new Map<string, typeof lines>();
    for (const line of lines) {
      const farm = line.item.farmName ?? "Verified farm";
      byFarm.set(farm, [...(byFarm.get(farm) ?? []), line]);
    }
    return [...byFarm.entries()];
  }, [lines]);

  const total = lines.reduce((sum, l) => sum + (l.unavailable ? 0 : l.price * l.item.quantity), 0);
  const blocked = lines.some((l) => l.unavailable || l.tooMany);

  async function handleCheckout(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const orders = await api.checkout({
        items: basket.items.map((i) => ({ product_id: i.productId, quantity: String(i.quantity) })),
        delivery_address: address.trim(),
        buyer_note: note.trim() || null,
      });
      basket.clear();
      navigate("/orders", { state: { placed: orders.length } });
    } catch (err) {
      setError(errorMessage(err));
      fresh.reload();
      setBusy(false);
    }
  }

  if (basket.items.length === 0) {
    return (
      <div className="container container--narrow page-pad">
        <header className="page-head">
          <h1 className="display-2">Your basket</h1>
        </header>
        <EmptyState
          title="Your basket is empty"
          body="Add produce from any verified farm, then check out once."
          action={<Link to="/shop" className="btn btn--ink">Browse the marketplace</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container page-pad">
      <header className="page-head">
        <h1 className="display-2">Your basket</h1>
        <p className="page-head__lead">
          {basket.count} {basket.count === 1 ? "item" : "items"} from {groups.length} {groups.length === 1 ? "farm" : "farms"}.
          Each farm confirms its own part of your order.
        </p>
      </header>

      <div className="basket">
        <div className="basket__items">
          {groups.map(([farm, farmLines]) => (
            <section key={farm} className="basket-farm" aria-label={farm}>
              <h2 className="basket-farm__name">{farm}</h2>
              <ul>
                {farmLines.map((line) => (
                  <BasketLine
                    key={line.item.productId}
                    {...line}
                    onQuantity={(q) => basket.setQuantity(line.item.productId, q)}
                    onRemove={() => basket.remove(line.item.productId)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <form className="basket__summary" onSubmit={handleCheckout}>
          <h2 className="basket__summary-title">Delivery</h2>
          <TextAreaField
            id="address"
            label="Delivery address"
            rows={3}
            required
            minLength={5}
            maxLength={250}
            placeholder="Street, area and town"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <TextAreaField
            id="note"
            label="Note for the farms"
            optional
            rows={2}
            maxLength={2000}
            placeholder="e.g. Please call when you arrive"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <dl className="basket__totals">
            <div>
              <dt>Items</dt>
              <dd>{basket.count}</dd>
            </div>
            <div className="basket__total">
              <dt>Total</dt>
              <dd>{naira(total)}</dd>
            </div>
          </dl>
          {blocked && <Notice tone="warning">Update the items marked above before placing your order.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <button className="btn btn--lime btn--lg btn--block" disabled={busy || blocked || fresh.loading}>
            {busy ? "Placing order…" : `Place order · ${naira(total)}`}
          </button>
          <p className="basket__fine">Prices and stock are confirmed when you place your order.</p>
        </form>
      </div>
    </div>
  );
}

function BasketLine({
  item,
  price,
  stock,
  unavailable,
  priceChanged,
  tooMany,
  onQuantity,
  onRemove,
}: {
  item: BasketItem;
  price: number;
  stock: number;
  unavailable: boolean;
  priceChanged: boolean;
  tooMany: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const max = Math.max(1, Math.floor(stock));
  return (
    <li className={`basket-line${unavailable ? " is-unavailable" : ""}`}>
      <Link to={`/products/${item.productId}`} className="basket-line__thumb" tabIndex={-1} aria-hidden="true">
        <ProductThumb name={item.name} imageUrl={item.imageUrl} />
      </Link>
      <div className="basket-line__main">
        <Link to={`/products/${item.productId}`} className="basket-line__name">
          {item.name}
        </Link>
        <span className="basket-line__meta">
          {naira(price)} / {item.unit}
          {priceChanged && <span className="basket-line__flag"> · price updated</span>}
        </span>
        {unavailable && <span className="basket-line__warn">No longer available. Remove it to continue.</span>}
        {tooMany && (
          <span className="basket-line__warn">
            Only {Math.floor(stock)} {item.unit} left. Lower the quantity to continue.
          </span>
        )}
        {!unavailable && (
          <div className="stepper stepper--sm" role="group" aria-label={`Quantity of ${item.name}`}>
            <button type="button" aria-label="Decrease quantity" onClick={() => onQuantity(item.quantity - 1)} disabled={item.quantity <= 1}>
              <Icon name="minus" size={16} strokeWidth={2} />
            </button>
            <output>
              {item.quantity} {item.unit}
            </output>
            <button type="button" aria-label="Increase quantity" onClick={() => onQuantity(item.quantity + 1)} disabled={item.quantity >= max}>
              <Icon name="plus" size={16} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
      <div className="basket-line__end">
        <span className="basket-line__total">{unavailable ? "—" : naira(price * item.quantity)}</span>
        <button type="button" className="basket-line__remove" onClick={onRemove} aria-label={`Remove ${item.name}`}>
          <Icon name="trash" size={18} />
        </button>
      </div>
    </li>
  );
}
