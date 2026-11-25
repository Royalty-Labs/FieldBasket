import type { Product } from "../types";

// Set VITE_API_BASE_URL in the hosting dashboard. The local address is used
// only by `npm run dev`; a production build without it fails loudly.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://127.0.0.1:8001" : "")
).replace(/\/$/, "");

if (!API_BASE_URL) {
  console.error("FieldBasket: VITE_API_BASE_URL is not set, so the website can't reach the API.");
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem("farmlink_access_token");
}

export function saveToken(token: string): void {
  localStorage.setItem("farmlink_access_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("farmlink_access_token");
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map((item: { msg?: string }) => item.msg).join(", ")
            : message;
    } catch {
      // Keep the fallback message when the response isn't JSON.
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<Product> {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest<Product>(
    `/products/${productId}/image`,
    {
      method: "POST",
      body: formData,
    },
  );
}
