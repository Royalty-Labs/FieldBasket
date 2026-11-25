import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import * as api from "../../api/endpoints";
import { useAuth } from "../../auth/useAuth";
import type { BasketItem } from "../../basket/basketStore";
import { useBasket } from "../../basket/useBasket";
import { EmptyState, Notice } from "../../components/Feedback";
import { TextAreaField, TextField } from "../../components/Fields";
import { Icon } from "../../components/Icon";
import { ProductThumb } from "../../components/ProductThumb";
import { naira } from "../../lib/format";
import { goToPayment, saveDeliveryDetails, savedDeliveryDetails } from "../../lib/payment";
import { errorMessage, useApi } from "../../lib/useApi";
import type { PaymentProvider, Product } from "../../types";

const PROVIDER_NOTE: Record<PaymentProvider, string> = {
  paystack: "Card, bank transfer or USSD",
  interswitch: "Verve, Mastercard or Visa",
};

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

function useCheckoutOptions() {
  const load = useCallback(async () => {
    const [zones, providers] = await Promise.all([api.listDeliveryZones(), api.listPaymentProviders()]);
    return { zones, providers };
  }, []);
  return useApi(load);
}

export default function Basket() {
  const basket = useBasket();
  const { user } = useAuth();
  const fresh = useFreshListings(basket.items.map((i) => i.productId));
  const options = useCheckoutOptions();
  const [saved] = useState(() => (user ? savedDeliveryDetails(user.id) : {}));
  const [address, setAddress] = useState(saved.address ?? "");
  const [phone, setPhone] = useState(saved.phone ?? "");
  const [zoneChoice, setZoneChoice] = useState(saved.zoneId ?? "");
  const [providerChoice, setProviderChoice] = useState<PaymentProvider | "">("");
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

  const zones = options.data?.zones ?? [];
  const providers = options.data?.providers ?? [];
  // Fall back to the first option if a saved choice no longer exists.
  const zone = zones.find((z) => z.id === zoneChoice) ?? (zones.length === 1 ? zones[0] : undefined);
  const provider = providers.find((p) => p.id === providerChoice)?.id ?? providers[0]?.id;

  const subtotal = lines.reduce((sum, l) => sum + (l.unavailable ? 0 : l.price * l.item.quantity), 0);
  const deliveryFee = zone ? Number(zone.fee) : 0;
  const total = subtotal + deliveryFee;
  const blocked = lines.some((l) => l.unavailable || l.tooMany);
  const cannotPay = options.data !== undefined && (zones.length === 0 || providers.length === 0);

  async function handleCheckout(event: FormEvent) {
    event.preventDefault();
    if (!zone || !provider) {
      setError(!zone ? "Choose where we should deliver to." : "Choose how you'd like to pay.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const start = await api.checkout({
        items: basket.items.map((i) => ({ product_id: i.productId, quantity: String(i.quantity) })),
        provider,
        delivery_zone_id: zone.id,
        buyer_phone: phone.trim(),
        delivery_address: address.trim(),
        buyer_note: note.trim() || null,
      });
      if (user) saveDeliveryDetails(user.id, { phone: phone.trim(), address: address.trim(), zoneId: zone.id });
      // The basket is kept until the payment is confirmed.
      goToPayment(start);
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
          <div className="field">
            <label htmlFor="zone" className="field__label">Delivery area</label>
            <select
              id="zone"
              className="input"
              required
              value={zone?.id ?? ""}
              onChange={(e) => setZoneChoice(e.target.value)}
              disabled={options.loading && !options.data}
            >
              <option value="" disabled>
                {options.loading && !options.data ? "Loading areas…" : "Choose your area"}
              </option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} · {Number(z.fee) === 0 ? "Free delivery" : naira(z.fee)}
                </option>
              ))}
            </select>
            {zone?.description && <p className="field__hint">{zone.description}</p>}
          </div>
          <TextAreaField
            id="address"
            label="Delivery address"
            rows={2}
            required
            minLength={5}
            maxLength={250}
            placeholder="House number, street and landmark"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <TextField
            id="phone"
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            minLength={7}
            maxLength={30}
            pattern={"[0-9+\\(\\) \\-]{7,30}"}
            title="Digits, spaces, +, - and brackets only"
            placeholder="0803 123 4567"
            hint="For the farm and the rider to reach you about this delivery."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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

          {providers.length > 0 && (
            <fieldset className="pay-options">
              <legend className="field__label">Pay with</legend>
              {providers.map((p) => (
                <label key={p.id} className={`pay-option${provider === p.id ? " is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="provider"
                    value={p.id}
                    checked={provider === p.id}
                    onChange={() => setProviderChoice(p.id)}
                  />
                  <span className="pay-option__text">
                    <span className="pay-option__name">{p.name}</span>
                    <span className="pay-option__note">{PROVIDER_NOTE[p.id]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <dl className="basket__totals">
            <div>
              <dt>Produce ({basket.count} {basket.count === 1 ? "item" : "items"})</dt>
              <dd>{naira(subtotal)}</dd>
            </div>
            <div>
              <dt>Delivery{zone ? ` to ${zone.name}` : ""}</dt>
              <dd>{zone ? (deliveryFee === 0 ? "Free" : naira(deliveryFee)) : "—"}</dd>
            </div>
            <div className="basket__total">
              <dt>Total</dt>
              <dd>{naira(total)}</dd>
            </div>
          </dl>
          {blocked && <Notice tone="warning">Update the items marked above before you pay.</Notice>}
          {cannotPay && (
            <Notice tone="warning">
              {zones.length === 0
                ? "Delivery isn't open yet. Please check back soon."
                : "Online payment is being set up. Please check back soon."}
            </Notice>
          )}
          {options.error && <Notice tone="error">{options.error}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <button
            className="btn btn--lime btn--lg btn--block"
            disabled={busy || blocked || cannotPay || fresh.loading || !options.data}
          >
            {busy ? "Opening secure payment…" : `Pay ${naira(total)}`}
          </button>
          <p className="basket__fine">
            <Icon name="shield" size={14} /> You pay on {provider ? providers.find((p) => p.id === provider)?.name : "a secure page"};
            FieldBasket never sees your card. If a farm can't supply an item, that part is refunded.
          </p>
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
