import type { Order, OrderEvent, Status } from "../../shared/orders";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export type OrderPage = { items: Order[]; nextCursor: string | null };
export type Stats = {
  byStatus: { status: Status; count: number }[];
  byMonth: { month: string; count: number }[];
  newLast7Days: number;
};

export const api = {
  me: () => request<{ email: string }>("/me"),
  stats: () => request<Stats>("/stats"),
  orders: (p: { status?: Status; q?: string; cursor?: string | null }) => {
    const qs = new URLSearchParams();
    if (p.status) qs.set("status", p.status);
    if (p.q) qs.set("q", p.q);
    if (p.cursor) qs.set("cursor", p.cursor);
    const s = qs.toString();
    return request<OrderPage>(`/orders${s ? `?${s}` : ""}`);
  },
  order: (id: string) => request<{ order: Order; events: OrderEvent[] }>(`/orders/${encodeURIComponent(id)}`),
  updateOrder: (id: string, body: { status?: Status; notes?: string }) =>
    request<{ order: Order; emailQueued: boolean }>(`/orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  addNote: (id: string, body: string) =>
    request<{ ok: true }>(`/orders/${encodeURIComponent(id)}/notes`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
};

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
