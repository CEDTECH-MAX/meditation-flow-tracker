import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell, useMe } from "@/components/AppShell";
import { Spinner } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { data: me, isLoading } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && me && !me.isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [isLoading, me, navigate]);

  if (isLoading || !me?.isAdmin)
    return (
      <AppShell admin>
        <Spinner label="Checking permissions" />
      </AppShell>
    );

  return (
    <AppShell admin>
      <Outlet />
    </AppShell>
  );
}
