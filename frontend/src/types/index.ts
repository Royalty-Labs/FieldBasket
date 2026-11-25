export type Role = "buyer" | "farmer" | "admin";

export type User = {
  id: string;
  full_name: string;
  email: string;
  role: Role | string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
};

export type VerificationStatus = "pending" | "approved" | "rejected";

export type FarmerProfile = {
  id: string;
  user_id: string;
  farm_name: string;
  phone: string;
  state: string;
  town: string;
  address: string | null;
  verification_status: VerificationStatus;
  rejection_reason: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  bank_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminFarmerProfile = FarmerProfile & {
  user: { id: string; full_name: string; email: string };
};

export type Product = {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  category: string;
  price_per_unit: number | string;
  unit: string;
  quantity_available: number | string;
  location: string;
  is_available: boolean;
  image_url: string | null;
  farm_name: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type OrderStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "ready_for_fulfillment"
  | "completed"
  | "cancelled";

export type PaymentStatus = "not_required" | "awaiting" | "paid" | "failed" | "refund_pending" | "refunded";

export type PaymentProvider = "paystack" | "interswitch";

export type DeliveryZone = {
  id: string;
  name: string;
  description: string | null;
  fee: number | string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CheckoutStart = {
  reference: string;
  provider: PaymentProvider;
  amount_total: number | string;
  redirect_url: string | null;
  form_action: string | null;
  form_fields: Record<string, string>;
};

export type PaymentState = {
  reference: string;
  provider: PaymentProvider;
  status: "awaiting_payment" | "paid" | "failed" | "expired";
  items_total: number | string;
  delivery_fee: number | string;
  amount_total: number | string;
  delivery_zone_name: string;
  order_count: number;
  paid_at: string | null;
};

export type Order = {
  id: string;
  buyer_id: string;
  farmer_id: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  quantity: number | string;
  unit_price: number | string;
  total_price: number | string;
  delivery_address: string;
  buyer_note: string | null;
  rejection_reason: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  delivery_stage: "picked_up" | "out_for_delivery" | "delivered" | null;
  commission_percent: number | string;
  farmer_amount: number | string | null;
  farm_phone: string | null;
  farm_town: string | null;
  farm_address: string | null;
  buyer_phone: string | null;
  delivery_zone_name: string | null;
  checkout_reference: string | null;
  buyer_name: string | null;
  farm_name: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminSettings = {
  commission_percent: number | string;
  service_area: string;
  operator_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  support_whatsapp: string | null;
  updated_at: string;
};

export type Payout = {
  id: string;
  farmer_id: string;
  farm_name: string | null;
  amount: number | string;
  gross_amount: number | string;
  commission_amount: number | string;
  order_count: number;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  transfer_reference: string;
  note: string | null;
  created_at: string;
};

export type PayoutDue = {
  farmer_id: string;
  farm_name: string;
  farmer_name: string;
  phone: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  bank_updated_at: string | null;
  order_count: number;
  gross_amount: number | string;
  commission_amount: number | string;
  amount: number | string;
  oldest_delivered_at: string;
};

export type Earnings = {
  commission_percent: number | string;
  owed: number | string;
  owed_orders: number;
  in_progress: number | string;
  in_progress_orders: number;
  paid_out: number | string;
  payouts: Payout[];
  has_bank_details: boolean;
};

export type AdminOverview = {
  orders_today: number;
  revenue_today: number | string;
  revenue_7_days: number | string;
  revenue_30_days: number | string;
  commission_30_days: number | string;
  farms_pending: number;
  farms_approved: number;
  refunds_due: number;
  awaiting_farm: number;
  ready_for_pickup: number;
  on_the_way: number;
  payouts_owed: number | string;
  payouts_owed_farms: number;
  live_listings: number;
  buyers: number;
  daily: { day: string; amount: number | string; orders: number }[];
  commission_percent: number | string;
  setup: Record<"payments" | "email" | "delivery_areas" | "commission" | "support_contact" | "operator_name" | "error_alerts", boolean>;
};
