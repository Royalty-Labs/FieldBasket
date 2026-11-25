import { ApiError, apiRequest, uploadProductImage } from "./client";
import type {
  AdminFarmerProfile,
  AuthResponse,
  CheckoutStart,
  DeliveryZone,
  PaymentProvider,
  PaymentState,
  FarmerProfile,
  Order,
  OrderStatus,
  Product,
  Role,
  User,
  VerificationStatus,
} from "../types";

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

// Auth
export const login = (email: string, password: string) =>
  apiRequest<AuthResponse>("/auth/login", json("POST", { email, password }));

export const register = (data: {
  full_name: string;
  email: string;
  password: string;
  role: Exclude<Role, "admin">;
  accept_terms: boolean;
}) => apiRequest<User>("/auth/register", json("POST", data));

export const requestPasswordReset = (email: string) =>
  apiRequest<{ detail: string }>("/auth/password-reset/request", json("POST", { email }));

export const confirmPasswordReset = (token: string, password: string) =>
  apiRequest<{ detail: string }>("/auth/password-reset/confirm", json("POST", { token, password }));

export const getMe = () => apiRequest<User>("/auth/me");

// Marketplace
export const listProducts = (params: { category?: string; search?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.search) query.set("search", params.search);
  query.set("limit", "50");
  return apiRequest<Product[]>(`/products?${query.toString()}`);
};

export const getProduct = (id: string) => apiRequest<Product>(`/products/${id}`);

// Orders
export const checkout = (data: {
  items: { product_id: string; quantity: string }[];
  provider: PaymentProvider;
  delivery_zone_id: string;
  buyer_phone: string;
  delivery_address: string;
  buyer_note?: string | null;
}) => apiRequest<CheckoutStart>("/orders/checkout", json("POST", data));

// Payments and delivery
export const listPaymentProviders = () =>
  apiRequest<{ id: PaymentProvider; name: string }[]>("/payments/providers");
export const getPayment = (reference: string) =>
  apiRequest<PaymentState>(`/payments/${encodeURIComponent(reference)}`);
export const verifyPayment = (reference: string) =>
  apiRequest<PaymentState>(`/payments/${encodeURIComponent(reference)}/verify`, { method: "POST" });
export const listDeliveryZones = () => apiRequest<DeliveryZone[]>("/delivery-zones");

export const listMyOrders = () => apiRequest<Order[]>("/orders/mine");
export const listFarmerOrders = () => apiRequest<Order[]>("/orders/farmer");

export const updateOrderStatus = (
  id: string,
  status: Exclude<OrderStatus, "pending">,
  rejectionReason?: string,
) =>
  apiRequest<Order>(
    `/orders/${id}/status`,
    json("PATCH", {
      status,
      rejection_reason: status === "rejected" ? rejectionReason : null,
    }),
  );

// Farmer
/** The signed-in farmer's profile, or null if they haven't created one yet. */
export const getMyProfile = async (): Promise<FarmerProfile | null> => {
  try {
    return await apiRequest<FarmerProfile>("/farmers/me/profile");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

export const saveMyProfile = (
  data: { farm_name: string; phone: string; town: string; address: string | null },
  exists: boolean,
) => apiRequest<FarmerProfile>("/farmers/me/profile", json(exists ? "PATCH" : "POST", data));

export const listMyProducts = () => apiRequest<Product[]>("/products/mine");

export const createProduct = (data: {
  name: string;
  description: string | null;
  category: string;
  price_per_unit: string;
  unit: string;
  quantity_available: string;
}) => apiRequest<Product>("/products", json("POST", data));

export type ProductUpdateData = {
  name?: string;
  description?: string | null;
  category?: string;
  price_per_unit?: string;
  unit?: string;
  quantity_available?: string;
  is_available?: boolean;
};

export const updateProduct = (id: string, data: ProductUpdateData) =>
  apiRequest<Product>(`/products/${id}`, json("PATCH", data));

export { uploadProductImage };

export const deleteProduct = (id: string) =>
  apiRequest<void>(`/products/${id}`, { method: "DELETE" });

// Admin
export const listFarmerApplications = (status?: VerificationStatus) =>
  apiRequest<AdminFarmerProfile[]>(
    `/admin/farmer-profiles${status ? `?verification_status=${status}` : ""}`,
  );

export const reviewFarmerApplication = (
  id: string,
  verification_status: "approved" | "rejected",
  rejection_reason?: string,
) =>
  apiRequest<AdminFarmerProfile>(
    `/admin/farmer-profiles/${id}/review`,
    json("PATCH", { verification_status, rejection_reason: rejection_reason ?? null }),
  );

export const listAdminOrders = (paymentStatus: "all" | "paid" | "refund_pending" | "refunded" = "all") =>
  apiRequest<Order[]>(`/admin/orders?payment_status=${paymentStatus}`);
export const markRefunded = (orderId: string) =>
  apiRequest<Order>(`/admin/orders/${orderId}/refund-complete`, { method: "PATCH" });

export type DeliveryZoneData = {
  name: string;
  description: string | null;
  fee: string;
  is_active: boolean;
  sort_order: number;
};
export const listAllDeliveryZones = () => apiRequest<DeliveryZone[]>("/admin/delivery-zones");
export const createDeliveryZone = (data: DeliveryZoneData) =>
  apiRequest<DeliveryZone>("/admin/delivery-zones", json("POST", data));
export const updateDeliveryZone = (id: string, data: Partial<DeliveryZoneData>) =>
  apiRequest<DeliveryZone>(`/admin/delivery-zones/${id}`, json("PATCH", data));
export const deleteDeliveryZone = (id: string) =>
  apiRequest<void>(`/admin/delivery-zones/${id}`, { method: "DELETE" });
