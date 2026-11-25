// Types for lib/outbox.js, used by the admin Worker (TypeScript).
export declare const MAX_ATTEMPTS: number;

export type OutboxKind = "order_client" | "order_admin" | "status_change";

export declare function enqueueStatement(
  db: D1Database,
  m: { orderId: string; kind: OutboxKind; to: string; replyTo?: string; subject: string; html: string; now: number },
): D1PreparedStatement;

export declare function deliver(
  db: D1Database,
  env: { RESEND_API_KEY?: string; FROM_EMAIL?: string },
  ids: number[],
): Promise<{ sent: number; failed: number }>;

export declare function processPending(
  db: D1Database,
  env: { RESEND_API_KEY?: string; FROM_EMAIL?: string },
  limit?: number,
): Promise<{ sent: number; failed: number }>;
