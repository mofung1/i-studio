import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router";
import {
  AdminAccountProvider,
  useAdminAccount,
} from "@/components/account-provider";
import { LoginForm } from "@/components/admin/login-form";
import { AdminShell } from "@/components/layout/admin-shell";
import { SiteBrandingProvider } from "@/components/site-branding-provider";
import { Button } from "@/components/ui/button";
import { ThemeProvider } from "@/context/theme-provider";
import { defaultSiteBranding } from "@/lib/site-settings";
import Link from "@/routing/link";
import "./styles/index.css";
import "./app/operations.css";
import "./app/library.css";
import "./app/admin/admin.css";
import "./app/admin/data-table.css";
import "./styles/legacy-overlays.css";
import "./styles/admin-adapter.css";
import "./styles/admin-feature-layouts.css";

function SessionBoundary() {
  const location = useLocation();
  const { account, loading, error, refresh } = useAdminAccount();
  if (location.pathname === "/admin/login") return <Outlet />;
  if (loading)
    return (
      <div className="admin-center text-muted-foreground" role="status">
        正在验证后台权限…
      </div>
    );
  if (error)
    return (
      <div className="admin-center">
        <p role="alert">{error}</p>
        <Button onClick={refresh}>重试</Button>
      </div>
    );
  if (!account.authenticated || account.user?.role !== "admin") {
    return (
      <Navigate to="/admin/login" search={{ next: location.href }} replace />
    );
  }
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}

function RootLayout() {
  return (
    <ThemeProvider storageKey="istudio-admin-theme">
      <SiteBrandingProvider initialBranding={defaultSiteBranding}>
        <AdminAccountProvider>
          <SessionBoundary />
        </AdminAccountProvider>
      </SiteBrandingProvider>
    </ThemeProvider>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <div className="admin-center">
      <h1>页面不存在</h1>
      <Link href="/admin/">返回运营概览</Link>
    </div>
  ),
});

const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <Navigate to="/admin/" replace />,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/",
    component: lazyRouteComponent(() => import("./app/admin/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/login",
    component: LoginForm,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/settings",
    component: lazyRouteComponent(() => import("./app/admin/settings/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/models",
    component: lazyRouteComponent(() => import("./app/admin/models/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/users",
    component: lazyRouteComponent(() => import("./app/admin/users/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/tasks",
    component: lazyRouteComponent(() => import("./app/admin/tasks/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/feedback",
    component: lazyRouteComponent(() => import("./app/admin/feedback/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/prompts",
    component: lazyRouteComponent(() => import("./app/admin/prompts/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/inspiration",
    component: lazyRouteComponent(() => import("./app/admin/inspiration/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/inspiration/categories",
    component: () => (
      <Navigate to="/admin/inspiration" search={{ categories: "1" }} replace />
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/submissions",
    component: lazyRouteComponent(() => import("./app/admin/submissions/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/site",
    component: lazyRouteComponent(() => import("./app/admin/site/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/storage",
    component: lazyRouteComponent(() => import("./app/admin/storage/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/operations",
    component: lazyRouteComponent(() => import("./app/admin/operations/page")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/audit",
    component: lazyRouteComponent(() => import("./app/admin/audit/page")),
  }),
]);

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
