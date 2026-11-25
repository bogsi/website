import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { STATUSES, STATUS_LABEL, type OrderEvent, type Status } from "../../shared/orders";
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

  if (detail.isPending) return <Spinner />;
  if (detail.error || !order) return <ErrorNote error={detail.error ?? new Error("Not found")} />;

  const statusDirty = status !== "" && status !== order.status;
  const saveStatus = () => {
    if (!statusDirty) return;
    const ok = window.confirm(
      `Change status to "${STATUS_LABEL[status as Status]}"?\n\nThis emails ${order.email} automatically.`,
    );
    if (ok) update.mutate({ status: status as Status });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/orders" className="text-sm text-muted hover:text-ink">← Orders</Link>
        <h1 className="font-mono text-xl text-accent">{order.id}</h1>
        <StatusBadge status={order.status} />
        <span className="text-sm text-muted">received {fmtDate(order.created_at)}{order.source === "import" ? " · imported" : ""}</span>
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
              <Button variant="primary" className="w-full" disabled={!statusDirty || update.isPending} onClick={saveStatus}>
                {update.isPending ? "Saving…" : "Save status & email client"}
              </Button>
              <p className="text-xs text-muted">Every status change sends the client an email.</p>
              <ErrorNote error={update.error} />
            </div>
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
