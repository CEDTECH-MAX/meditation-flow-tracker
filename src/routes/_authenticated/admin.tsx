import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell, useMe } from "@/components/AppShell";
import { ErrorState, Spinner } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { data: me, isLoading, error, refetch } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && me && !me.isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [isLoading, me, navigate]);

  // Without this the permission check spins forever whenever the lookup fails.
  if (error)
    return (
      <AppShell admin>
        <ErrorState
          title="We could not check your permissions"
          error={error}
          onRetry={() => void refetch()}
        />
      </AppShell>
    );

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
