import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { STATUSES, STATUS_LABEL, type Status } from "../../shared/orders";
import { api, fmtDate } from "../lib/api";
import { Button, ErrorNote, Spinner, StatusBadge } from "../ui";

export type OrdersSearch = { status?: Status; q?: string };

export function Orders({ search }: { search: OrdersSearch }) {
  const navigate = useNavigate({ from: "/orders" });
  const [q, setQ] = useState(search.q ?? "");

  // Debounce the search box into the URL, so filters survive reloads and links.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") !== q) navigate({ search: (s: OrdersSearch) => ({ ...s, q: q || undefined }), replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [q, search.q, navigate]);

  const list = useInfiniteQuery({
    queryKey: ["orders", search.status ?? null, search.q ?? ""],
    queryFn: ({ pageParam }) => api.orders({ status: search.status, q: search.q, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tab active={!search.status} to={undefined}>All</Tab>
        {STATUSES.map((s) => (
          <Tab key={s} active={search.status === s} to={s}>
            {STATUS_LABEL[s]}
          </Tab>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, company, ID"
          aria-label="Search orders"
          className="ml-auto w-full rounded border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent sm:w-72"
        />
        <a
          href={api.ordersCsvUrl({ status: search.status, q: search.q })}
          download
          className="rounded border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink"
          title="Download every order that matches the current filter as CSV"
        >
          Export CSV
        </a>
      </div>

      <ErrorNote error={list.error} />
      {list.isPending ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">No orders match.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line font-mono text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-normal">ID</th>
                <th className="px-4 py-2 font-normal">Date</th>
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Company</th>
                <th className="px-4 py-2 font-normal">Service</th>
                <th className="px-4 py-2 font-normal">Budget</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-line/60 last:border-0 hover:bg-line/30">
                  <td className="px-4 py-2 font-mono">
                    <Link to="/orders/$id" params={{ id: o.id }} className="text-accent hover:underline">
                      {o.id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-2">{o.full_name}</td>
                  <td className="px-4 py-2 text-muted">{o.company || "—"}</td>
                  <td className="px-4 py-2">{o.aws_service}</td>
                  <td className="px-4 py-2 text-muted">{o.budget || "—"}</td>
                  <td className="px-4 py-2"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-2 text-right"><DeleteOrderButton id={o.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.hasNextPage && (
        <Button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}

function Tab({ active, to, children }: { active: boolean; to: Status | undefined; children: React.ReactNode }) {
  return (
    <Link
      to="/orders"
      search={(s: OrdersSearch) => ({ ...s, status: to })}
      className={`rounded border px-3 py-1 text-sm ${active ? "border-accent text-accent" : "border-line text-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

/**
 * Two-step delete: the first click arms the button for 4 seconds, the second
 * deletes the order, its timeline and its emails for good.
 */
function DeleteOrderButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const remove = useMutation({
    mutationFn: () => api.deleteOrder(id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
  if (remove.isError) return <span className="text-xs text-red-400" title={String(remove.error)}>failed</span>;
  return (
    <button
      type="button"
      disabled={remove.isPending}
      onClick={() => (armed ? remove.mutate() : setArmed(true))}
      aria-label={armed ? `Confirm deleting ${id}` : `Delete ${id}`}
      title={armed ? "Click again to delete permanently" : "Delete order"}
      className={`rounded px-2 py-1 text-xs transition disabled:opacity-50 ${
        armed ? "border border-red-500/60 text-red-400" : "text-muted hover:text-red-400"
      }`}
    >
      {remove.isPending ? "…" : armed ? "Confirm" : "Delete"}
    </button>
  );
}
