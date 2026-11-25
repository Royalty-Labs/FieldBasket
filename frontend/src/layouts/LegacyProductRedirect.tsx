import { Navigate, useParams } from "react-router";

/** Old product links (/shop/products/:id) keep working. */
export function LegacyProductRedirect() {
  const { productId } = useParams();
  return <Navigate to={`/products/${productId}`} replace />;
}
