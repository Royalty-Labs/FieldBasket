import { ApiError, apiRequest, uploadProductImage } from "./client";
import type {
  AdminFarmerProfile,
  AuthResponse,
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
}) => apiRequest<User>("/auth/register", json("POST", data));

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
export const placeOrder = (data: {
  product_id: string;
  quantity: string;
  delivery_address: string;
  buyer_note?: string | null;
}) => apiRequest<Order>("/orders", json("POST", data));

export const checkout = (data: {
  items: { product_id: string; quantity: string }[];
  delivery_address: string;
  buyer_note?: string | null;
}) => apiRequest<Order[]>("/orders/checkout", json("POST", data));

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
