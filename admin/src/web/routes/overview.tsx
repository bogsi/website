import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { STATUSES, STATUS_LABEL, type Status } from "../../shared/orders";
import { api } from "../lib/api";
import { ErrorNote, Panel, Spinner } from "../ui";

const OPEN: Status[] = ["new", "contacted", "quoted", "in_progress"];

export function Overview() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  if (stats.isPending) return <Spinner />;
  if (stats.error) return <ErrorNote error={stats.error} />;

  const by = Object.fromEntries(stats.data.byStatus.map((r) => [r.status, r.count])) as Partial<Record<Status, number>>;
  const count = (s: Status) => by[s] ?? 0;
  const open = OPEN.reduce((n, s) => n + count(s), 0);
  const decided = count("won") + count("lost");
  const winRate = decided ? Math.round((count("won") / decided) * 100) : null;
  const maxMonth = Math.max(1, ...stats.data.byMonth.map((m) => m.count));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="New in the last 7 days" value={stats.data.newLast7Days} />
        <Card label="Open inquiries" value={open} hint="new, contacted, quoted, in progress" />
        <Card label="Win rate" value={winRate === null ? "—" : `${winRate}%`} hint={`${count("won")} won of ${decided} decided`} />
      </div>

      <Panel title="orders per month">
        {stats.data.byMonth.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <div className="flex h-40 items-end gap-2" role="img" aria-label="Orders per month">
            {stats.data.byMonth.map((m) => (
              <div key={m.month} className="flex h-full flex-1 flex-col items-center gap-1">
                <span className="font-mono text-xs text-muted">{m.count}</span>
                {/* Fixed-height track so the bar's percentage height has something to resolve against. */}
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-accent/70" style={{ height: `${(m.count / maxMonth) * 100}%` }} />
                </div>
                <span className="font-mono text-[11px] text-muted">{m.month.slice(2)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="by status">
        <ul className="grid gap-2 sm:grid-cols-4">
          {STATUSES.map((s) => (
            <li key={s}>
              <Link
                to="/orders"
                search={{ status: s }}
                className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm hover:border-accent"
              >
                <span>{STATUS_LABEL[s]}</span>
                <span className="font-mono text-muted">{count(s)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-mono text-3xl text-accent">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
