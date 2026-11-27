import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  RESEND_DAILY_LIMIT,
  STATUSES,
  STATUS_LABEL,
  retentionDeleteAt,
  type OrderEmail,
  type OrderEvent,
  type Status,
} from "../../shared/orders";
import { api, fmtDate, fmtDateTime } from "../lib/api";
import { Button, ErrorNote, Panel, Spinner, StatusBadge } from "../ui";

export function OrderDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["order", id], queryFn: () => api.order(id) });
  const order = detail.data?.order;

  const [status, setStatus] = useState<Status | "">("");
  const [notes, setNotes] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (order) {
      setStatus(order.status);
      setNotes(order.notes);
    }
  }, [order?.id, order?.status, order?.notes]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const navigate = useNavigate();
  const [confirmId, setConfirmId] = useState("");
  const remove = useMutation({
    mutationFn: () => api.deleteOrder(id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      void navigate({ to: "/orders" });
    },
  });

  const update = useMutation({
    mutationFn: (body: { status?: Status; notes?: string }) => api.updateOrder(id, body),
    // The status email is sent in the background; refetch shortly to show its outcome.
    onSuccess: (r) => {
      refresh();
      if (r.emailQueued) setTimeout(refresh, 2500);
    },
  });
  const addNote = useMutation({
    mutationFn: (body: string) => api.addNote(id, body),
    onSuccess: () => {
      setNote("");
      refresh();
    },
  });

  const statusChoice = status !== "" && order && status !== order.status ? (status as Status) : null;
  const preview = useQuery({
    queryKey: ["status-email", id, statusChoice],
    queryFn: () => api.statusEmailPreview(id, statusChoice!),
    enabled: statusChoice !== null,
  });
  const resend = useMutation({
    mutationFn: (emailId: number) => api.resendEmail(id, emailId),
    onSuccess: refresh,
  });

  if (detail.isPending) return <Spinner />;
  if (detail.error || !order) return <ErrorNote error={detail.error ?? new Error("Not found")} />;

  const statusDirty = statusChoice !== null;
  // The preview below is the confirmation: saving is only possible once the
  // client's email for the chosen status is on screen.
  const saveStatus = () => {
    if (statusChoice && preview.data) update.mutate({ status: statusChoice });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/orders" className="text-sm text-muted hover:text-ink">← Orders</Link>
        <h1 className="font-mono text-xl text-accent">{order.id}</h1>
        <StatusBadge status={order.status} />
        <span className="text-sm text-muted">received {fmtDate(order.created_at)}{order.source === "import" ? " · imported" : ""}</span>
        <span
          className={`text-sm ${order.notify_status === "failed" ? "text-red-300" : order.notify_status === "pending" ? "text-amber-200" : "text-muted"}`}
          title="Delivery of this order's emails. Pending emails are retried every hour."
        >
          · emails {order.notify_status === "sent" ? "delivered" : order.notify_status === "pending" ? "pending retry" : "failed"}
        </span>
        {retentionDeleteAt(order) !== null && (
          <span className="text-sm text-muted" title="Closed orders are deleted 24 months after their last change.">
            · deleted automatically on {fmtDate(retentionDeleteAt(order)!)}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Panel title="inquiry">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Name">{order.full_name}</Field>
              <Field label="Email">
                <a className="text-accent hover:underline" href={`mailto:${order.email}?subject=${encodeURIComponent(`Re: ${order.id}`)}`}>
                  {order.email}
                </a>
              </Field>
              <Field label="Company">{order.company || "—"}</Field>
              <Field label="AWS service">{order.aws_service}</Field>
              <Field label="Budget">{order.budget || "—"}</Field>
              <Field label="Deadline">{order.deadline || "—"}</Field>
            </dl>
            <h3 className="mt-5 font-mono text-xs text-muted">Description</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{order.description}</p>
          </Panel>

          <Panel title="timeline">
            <form
              className="mb-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) addNote.mutate(note.trim());
              }}
            >
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note to the timeline"
                aria-label="New timeline note"
                className="flex-1 rounded border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
              <Button type="submit" disabled={!note.trim() || addNote.isPending}>Add</Button>
            </form>
            <ErrorNote error={addNote.error} />
            <ol className="space-y-3">
              {detail.data.events.map((ev) => (
                <TimelineItem key={ev.id} ev={ev} />
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="status">
            <div className="space-y-3">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                aria-label="Status"
                className="w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              {statusDirty && (
                <div className="space-y-2 rounded border border-line p-3">
                  <p className="font-mono text-xs text-muted">The client will get this email</p>
                  {preview.isPending ? (
                    <Spinner />
                  ) : preview.data ? (
                    <>
                      <p className="text-xs">
                        <span className="text-muted">To:</span> {preview.data.to}
                        <br />
                        <span className="text-muted">Subject:</span> {preview.data.subject}
                      </p>
                      {/* sandbox with no permissions: no scripts, no forms, no navigation. */}
                      <iframe
                        title="Status email preview"
                        sandbox=""
                        srcDoc={preview.data.html}
                        className="h-56 w-full rounded border border-line bg-white"
                      />
                    </>
                  ) : (
                    <ErrorNote error={preview.error} />
                  )}
                </div>
              )}
              <Button
                variant="primary"
                className="w-full"
                disabled={!statusDirty || !preview.data || update.isPending}
                onClick={saveStatus}
              >
                {update.isPending ? "Saving…" : "Save status & send this email"}
              </Button>
              <p className="text-xs text-muted">Every status change sends the client an email.</p>
              <ErrorNote error={update.error} />
            </div>
          </Panel>

          <Panel title="emails">
            <EmailList emails={detail.data.emails} onResend={(emailId) => resend.mutate(emailId)} busy={resend.isPending} />
            <ErrorNote error={resend.error} />
            <p className="mt-3 text-xs text-muted">
              Resend's free plan sends at most {RESEND_DAILY_LIMIT} emails a day (resets 00:00 UTC). Failed emails are retried
              hourly, up to 5 times; "Resend" starts over for one email.
            </p>
          </Panel>

          <Panel title="internal notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              aria-label="Internal notes"
              className="w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted">Never sent to the client.</span>
              <Button disabled={notes === order.notes || update.isPending} onClick={() => update.mutate({ notes })}>
                Save notes
              </Button>
            </div>
          </Panel>

          <Panel title="delete order">
            <p className="text-xs text-muted">
              For erasure requests. Removes the order, its timeline and its emails for good. Backups expire within 30 days.
            </p>
            <input
              value={confirmId}
              onChange={(e) => setConfirmId(e.target.value)}
              placeholder={`Type ${order.id} to confirm`}
              aria-label="Type the order id to confirm deletion"
              className="mt-2 w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <Button
              className="mt-2 w-full border-red-500/60 text-red-400"
              disabled={confirmId !== order.id || remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
            {remove.isError && <ErrorNote error={remove.error} />}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function TimelineItem({ ev }: { ev: OrderEvent }) {
  const text = {
    created: "Inquiry received",
    status_change: `Status ${ev.from_status ? STATUS_LABEL[ev.from_status] : "—"} → ${ev.to_status ? STATUS_LABEL[ev.to_status] : "—"}`,
    note: ev.body,
    email_sent: ev.body,
    email_failed: ev.body,
  }[ev.type];
  const tone = ev.type === "email_failed" ? "text-red-300" : ev.type === "note" ? "text-ink" : "text-muted";
  return (
    <li className="flex gap-3 text-sm">
      <span className="w-28 shrink-0 font-mono text-xs text-muted">{fmtDateTime(ev.at)}</span>
      <span className={`whitespace-pre-wrap ${tone}`}>
        {text}
        {ev.actor && !["system", "form", "import"].includes(ev.actor) && (
          <span className="ml-2 text-xs text-muted">· {ev.actor}</span>
        )}
      </span>
    </li>
  );
}

const EMAIL_KIND: Record<OrderEmail["kind"], string> = {
  order_client: "Confirmation to client",
  order_admin: "New order to you",
  status_change: "Status update to client",
};

function EmailList({ emails, onResend, busy }: { emails: OrderEmail[]; onResend: (id: number) => void; busy: boolean }) {
  if (emails.length === 0) return <p className="text-sm text-muted">No emails for this order.</p>;
  return (
    <ul className="space-y-3">
      {emails.map((e) => (
        <li key={e.id} className="text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate" title={e.subject}>{e.subject}</p>
              <p className="text-xs text-muted">
                {EMAIL_KIND[e.kind]} · {fmtDateTime(e.created_at)}
              </p>
            </div>
            {e.status === "failed" ? (
              <Button className="shrink-0" disabled={busy} onClick={() => onResend(e.id)}>
                Resend
              </Button>
            ) : (
              <span className={`shrink-0 font-mono text-xs ${e.status === "sent" ? "text-muted" : "text-amber-200"}`}>
                {e.status === "sent" ? "sent" : `retrying (${e.attempts}/5)`}
              </span>
            )}
          </div>
          {e.status === "failed" && (
            <p className="mt-1 break-words text-xs text-red-300">
              Gave up after {e.attempts} attempts{e.last_error ? `: ${e.last_error}` : ""}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
