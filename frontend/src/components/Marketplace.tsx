import { useCallback, useDeferredValue, useState } from "react";
import { Link } from "react-router";
import * as api from "../api/endpoints";
import { CATEGORIES } from "../lib/format";
import { useApi } from "../lib/useApi";
import { EmptyState, Notice } from "./Feedback";
import { Icon } from "./Icon";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";

const TABS = ["All", ...CATEGORIES];

/** Live produce from verified farms, with search and category tabs. */
export function Marketplace({ limit, showAllLink = false }: { limit?: number; showAllLink?: boolean }) {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());

  const load = useCallback(
    () => api.listProducts({ category: category === "All" ? undefined : category, search: query || undefined }),
    [category, query],
  );
  const { data, error, loading } = useApi(load);
  const products = limit ? data?.slice(0, limit) : data;

  return (
    <div className="market">
      <div className="market__tools">
        <div className="tabs tabs--light market__tabs" role="tablist" aria-label="Categories">
          {TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={category === tab}
              className={`tabs__tab${category === tab ? " is-active" : ""}`}
              onClick={() => setCategory(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <label className="search search--light market__search">
          <Icon name="search" size={18} />
          <input
            type="search"
            aria-label="Search produce"
            placeholder="Search produce"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading && !data ? (
        <div className="product-grid" aria-busy="true">
          {Array.from({ length: limit ?? 8 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products && products.length > 0 ? (
        <div className={`product-grid${loading ? " is-refreshing" : ""}`}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        !error && (
          <EmptyState
            title={query ? `Nothing matches “${query}” yet` : "No produce in this category yet"}
            body="Farmers add new harvests every day. Try another category or check back soon."
          />
        )
      )}

      {showAllLink && data && data.length > (limit ?? 0) && (
        <Link to="/shop" className="market__all">
          See all produce <Icon name="arrowRight" size={18} />
        </Link>
      )}
    </div>
  );
}
