export class ApiClientError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...options?.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (payload.code === "PASSWORD_CHANGE_REQUIRED"
      && typeof window !== "undefined"
      && window.location.pathname !== "/change-password") {
      window.location.assign("/change-password");
    }
    throw new ApiClientError(payload.error || "请求失败", payload.code, response.status);
  }
  return payload as T;
}

export function chinaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
