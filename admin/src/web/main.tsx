import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { STATUSES, type Status } from "../shared/orders";
import { ApiError, LOGOUT_URL, api } from "./lib/api";
import { AccountPage } from "./routes/account";
import { OrderDetail } from "./routes/order-detail";
import { Orders, type OrdersSearch } from "./routes/orders";
import { Overview } from "./routes/overview";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // An expired Access session answers 401: reload so Access can sign in again.
      retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    },
  },
});

function Shell() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  if (me.error instanceof ApiError && me.error.status === 401) {
    window.location.reload();
  }
  const nav = "rounded px-3 py-1.5 text-sm text-muted hover:text-ink [&.active]:bg-line/60 [&.active]:text-ink";
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="font-mono text-sm text-accent hover:underline" title="Overview">
            root@roussev.dev:/admin&gt;
          </Link>
          <nav className="flex gap-1">
            <Link to="/" className={nav} activeOptions={{ exact: true }}>Overview</Link>
            <Link to="/orders" className={nav}>Orders</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/account" className="font-mono text-xs text-muted hover:text-ink [&.active]:text-ink" title="Account settings">
              {me.data?.email ?? "account"}
            </Link>
            <a href={LOGOUT_URL} className="rounded border border-line px-2 py-1 text-xs text-muted hover:border-accent hover:text-ink">
              Sign out
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Overview });

const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders",
  validateSearch: (s: Record<string, unknown>): OrdersSearch => ({
    status: STATUSES.includes(s.status as Status) ? (s.status as Status) : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
  component: function OrdersPage() {
    return <Orders search={ordersRoute.useSearch()} />;
  },
});

const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders/$id",
  component: function OrderPage() {
    const { id } = orderRoute.useParams();
    return <OrderDetail id={id} />;
  },
});

const accountRoute = createRoute({ getParentRoute: () => rootRoute, path: "/account", component: AccountPage });

const router = createRouter({
  routeTree: rootRoute.addChildren([overviewRoute, ordersRoute, orderRoute, accountRoute]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
