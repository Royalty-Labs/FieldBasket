import { Link } from "react-router";
import { useAddToBasket } from "../basket/useAddToBasket";
import { useBasket } from "../basket/useBasket";
import { naira } from "../lib/format";
import type { Product } from "../types";
import { VerifiedMark } from "./Icon";
import { ProductThumb } from "./ProductThumb";

function town(location: string) {
  return location.split(",")[0].trim();
}

export function ProductCard({ product }: { product: Product }) {
  const addToBasket = useAddToBasket();
  const basket = useBasket();
  const inBasket = basket.quantityOf(product.id);

  return (
    <article className="product-card">
      <Link to={`/products/${product.id}`} className="product-card__media" tabIndex={-1} aria-hidden="true">
        <ProductThumb name={product.name} imageUrl={product.image_url} className="product-card__img" />
      </Link>
      <div className="product-card__body">
        <span className="product-card__farm">
          <VerifiedMark size={14} />
          {product.farm_name ?? "Verified farm"} · {town(product.location)}
        </span>
        <h3 className="product-card__name">
          <Link to={`/products/${product.id}`}>{product.name}</Link>
        </h3>
        <span className="product-card__price">
          {naira(product.price_per_unit)} <span className="muted">/ {product.unit}</span>
        </span>
      </div>
      <button
        type="button"
        className={`btn btn--sm product-card__add${inBasket ? " is-added" : ""}`}
        onClick={() => addToBasket(product)}
      >
        {inBasket ? `In basket · ${inBasket} ${product.unit}` : "Add to basket"}
      </button>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="product-card product-card--skeleton" aria-hidden="true">
      <span className="skeleton product-card__img" />
      <span className="skeleton skeleton--line" style={{ width: "70%" }} />
      <span className="skeleton skeleton--line" style={{ width: "45%" }} />
      <span className="skeleton skeleton--button" />
    </div>
  );
}
