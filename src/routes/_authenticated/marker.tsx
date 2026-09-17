import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card, Spinner } from "@/components/ui-kit";
import { getMarkerScope } from "@/lib/marker.functions";

export const Route = createFileRoute("/_authenticated/marker")({
  component: MarkerLayout,
});

export function useMarkerScope() {
  const fn = useServerFn(getMarkerScope);
  return useQuery({ queryKey: ["marker-scope"], queryFn: () => fn(), retry: false });
}

function MarkerLayout() {
  const { isLoading, error } = useMarkerScope();

  if (isLoading)
    return (
      <AppShell marker>
        <Spinner label="Loading your cohort" />
      </AppShell>
    );

  if (error)
    return (
      <AppShell marker>
        <Card>
          <h2 className="text-lg font-semibold">This area is for markers</h2>
          <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
        </Card>
      </AppShell>
    );

  return (
    <AppShell marker>
      <Outlet />
    </AppShell>
  );
}
