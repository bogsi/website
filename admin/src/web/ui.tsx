import type { ReactNode } from "react";
import { STATUS_LABEL, type Status } from "../shared/orders";

const STATUS_STYLE: Record<Status, string> = {
  new: "border-accent/60 text-accent bg-accent/10",
  contacted: "border-sky-400/50 text-sky-300 bg-sky-400/10",
  quoted: "border-violet-400/50 text-violet-300 bg-violet-400/10",
  won: "border-emerald-400/50 text-emerald-300 bg-emerald-400/10",
  lost: "border-zinc-500/60 text-zinc-400 bg-zinc-500/10",
  in_progress: "border-amber-300/50 text-amber-200 bg-amber-300/10",
  done: "border-teal-400/50 text-teal-300 bg-teal-400/10",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Panel({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          {title && <h2 className="font-mono text-sm text-muted">// {title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({
  variant = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" }) {
  const styles = {
    default: "border border-line bg-bg hover:border-muted",
    primary: "bg-accent text-bg font-semibold hover:brightness-110",
    ghost: "hover:bg-line/50",
  }[variant];
  return (
    <button
      {...props}
      className={`rounded px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{String((error as Error).message ?? error)}</p>;
}

export function Spinner() {
  return <p className="font-mono text-sm text-muted">loading…</p>;
}
