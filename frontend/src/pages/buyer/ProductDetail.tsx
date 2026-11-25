import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import * as api from "../../api/endpoints";
import { useAddToBasket } from "../../basket/useAddToBasket";
import { useBasket } from "../../basket/useBasket";
import { EmptyState, PageLoader } from "../../components/Feedback";
import { Icon, VerifiedMark } from "../../components/Icon";
import { ProductThumb } from "../../components/ProductThumb";
import { dateTime, naira, quantity } from "../../lib/format";
import { useApi } from "../../lib/useApi";

export default function ProductDetail() {
  const { productId = "" } = useParams();
  const load = useCallback(() => api.getProduct(productId), [productId]);
  const { data: product, error, loading } = useApi(load);
  const addToBasket = useAddToBasket();
  const basket = useBasket();
  const [qty, setQty] = useState(1);

  if (loading) return <PageLoader label="Loading product" />;

  if (!product) {
    return (
      <div className="container page-pad">
        <EmptyState
          title="This listing isn't available"
          body={error ?? "It may have sold out or been removed by the farmer."}
          action={<Link to="/shop" className="btn btn--ink">Back to the marketplace</Link>}
        />
      </div>
    );
  }

  const inBasket = basket.quantityOf(product.id);
  const maxQty = Math.max(1, Math.floor(Number(product.quantity_available)) - inBasket);
  const soldOut = Number(product.quantity_available) <= 0 || !product.is_available;

  return (
    <div className="container page-pad">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/shop">
          <Icon name="chevronLeft" size={16} strokeWidth={2} /> Marketplace
        </Link>
        <span aria-hidden="true">/</span>
        <span>{product.category}</span>
      </nav>

      <div className="pdp">
        <div className="pdp__media">
          <ProductThumb name={product.name} imageUrl={product.image_url} className="pdp__img" />
        </div>

        <div className="pdp__info">
          <span className="pdp__farm">
            <VerifiedMark /> {product.farm_name ?? "Verified farm"}
          </span>
          <h1 className="pdp__title">{product.name}</h1>
          <p className="pdp__price">
            {naira(product.price_per_unit)} <span className="muted">per {product.unit}</span>
          </p>

          {product.description && <p className="pdp__desc">{product.description}</p>}

          <dl className="details">
            <div>
              <dt>Farm location</dt>
              <dd>{product.location}</dd>
            </div>
            <div>
              <dt>In stock</dt>
              <dd>
                {quantity(product.quantity_available)} {product.unit}
              </dd>
            </div>
            <div>
              <dt>Listed</dt>
              <dd>{dateTime(product.created_at)}</dd>
            </div>
          </dl>

          {soldOut ? (
            <p className="notice notice--warning">Sold out for now. Check back soon.</p>
          ) : (
            <div className="pdp__buy">
              <div className="stepper" role="group" aria-label="Quantity">
                <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                  <Icon name="minus" size={18} strokeWidth={2} />
                </button>
                <output aria-live="polite">
                  {qty} {product.unit}
                </output>
                <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>
                  <Icon name="plus" size={18} strokeWidth={2} />
                </button>
              </div>
              <button
                type="button"
                className="btn btn--ink btn--lg pdp__add"
                onClick={() => {
                  addToBasket(product, qty);
                  setQty(1);
                }}
              >
                Add to basket · {naira(Number(product.price_per_unit) * qty)}
              </button>
            </div>
          )}

          {inBasket > 0 && (
            <p className="pdp__in-basket">
              <Icon name="check" size={16} strokeWidth={2.2} /> {inBasket} {product.unit} in your basket.{" "}
              <Link to="/basket">View basket</Link>
            </p>
          )}

          <p className="pdp__assure">
            <Icon name="shield" size={18} /> This farm was checked by our team before it could sell on FieldBasket.
          </p>
        </div>
      </div>
    </div>
  );
}
