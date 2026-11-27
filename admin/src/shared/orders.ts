// Shared between the API Worker and the dashboard SPA.

export const STATUSES = ["new", "contacted", "quoted", "won", "lost", "in_progress", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
  in_progress: "In progress",
  done: "Done",
};

export type Order = {
  id: string;
  created_at: number;
  updated_at: number;
  full_name: string;
  email: string;
  company: string;
  aws_service: string;
  description: string;
  budget: string;
  deadline: string;
  status: Status;
  notes: string;
  source: "form" | "import";
  notify_status: "pending" | "sent" | "failed";
};

export type OrderEvent = {
  id: number;
  order_id: string;
  at: number;
  actor: string;
  type: "created" | "status_change" | "note" | "email_sent" | "email_failed";
  from_status: Status | null;
  to_status: Status | null;
  body: string;
};

/** Closed orders are deleted this many days after their last change (T31). */
export const RETENTION_DAYS = 730;
export const CLOSED_STATUSES = ["done", "lost"] as const satisfies readonly Status[];

/** When a closed order will be deleted automatically, or null while it is open. */
export function retentionDeleteAt(o: Pick<Order, "status" | "updated_at">): number | null {
  return (CLOSED_STATUSES as readonly Status[]).includes(o.status)
    ? o.updated_at + RETENTION_DAYS * 24 * 60 * 60 * 1000
    : null;
}

/** One row of the email outbox as the dashboard sees it (no HTML body). */
export type OrderEmail = {
  id: number;
  kind: "order_client" | "order_admin" | "status_change";
  to_addr: string;
  subject: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  last_error: string;
  created_at: number;
  sent_at: number | null;
};

/** Resend's Free plan sends at most this many emails a day (resets 00:00 UTC). */
export const RESEND_DAILY_LIMIT = 100;
