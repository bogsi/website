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
