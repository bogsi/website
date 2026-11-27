import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LOGOUT_URL, api, fmtDate, fmtDateTime } from "../lib/api";
import { Button, ErrorNote, Panel, Spinner } from "../ui";

export function AccountPage() {
  const qc = useQueryClient();
  const account = useQuery({ queryKey: ["account"], queryFn: api.account });
  const retry = useMutation({
    mutationFn: api.retryEmails,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order"] });
    },
  });

  if (account.isPending) return <Spinner />;
  if (account.error) return <ErrorNote error={account.error} />;
  const a = account.data;
  const stuck = a.outbox.pending + a.outbox.failed;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-mono text-xl text-accent">Account</h1>

      <Panel title="signed in">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Email">{a.email}</Row>
          <Row label="Login">GitHub, through Cloudflare Access</Row>
          <Row label="Session expires">{a.sessionExpiresAt ? fmtDateTime(a.sessionExpiresAt) : "—"}</Row>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href={LOGOUT_URL} className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-bg hover:brightness-110">
            Sign out
          </a>
          <span className="text-xs text-muted">Who may sign in is set by the ADMIN_ALLOWED_EMAILS secret in GitHub.</span>
        </div>
      </Panel>

      <Panel title="notifications">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="New orders are sent to">{a.notifications.adminEmail ?? "not set"}</Row>
          <Row label="Emails are sent from">{a.notifications.fromEmail ?? "not set"}</Row>
        </dl>
        <p className="mt-3 text-xs text-muted">Both come from ADMIN_EMAIL and FROM_EMAIL on the Cloudflare Pages project.</p>
      </Panel>

      <Panel title="email delivery">
        <p className="text-sm">
          {stuck === 0 ? (
            "All emails delivered."
          ) : (
            <>
              <span className="text-amber-200">{a.outbox.pending} waiting for retry</span>
              {a.outbox.failed > 0 && <span className="text-red-300"> · {a.outbox.failed} gave up</span>}
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-muted">Failed emails are retried automatically every hour, up to 5 times.</p>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={() => retry.mutate()} disabled={stuck === 0 || retry.isPending}>
            {retry.isPending ? "Retrying…" : "Retry now"}
          </Button>
          {retry.data && (
            <span className="text-xs text-muted">
              {retry.data.sent} sent, {retry.data.failed} failed
            </span>
          )}
        </div>
        <ErrorNote error={retry.error} />
      </Panel>

      <Panel title="data retention">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Closed orders are deleted after">{Math.round(a.retention.days / 365)} years ({a.retention.days} days) without changes</Row>
          <Row label="Last cleanup">{a.retention.lastRunAt ? fmtDate(a.retention.lastRunAt) : "not run yet"}</Row>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Applies to Done and Lost orders only, with their timeline and emails. The cleanup runs daily at 03:00 UTC. The
          same period is stated on the privacy page.
        </p>
      </Panel>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}
