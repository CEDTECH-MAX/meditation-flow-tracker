import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DeveloperShell, useDeveloper } from "@/components/DeveloperShell";
import { Spinner } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/developer")({
  component: DeveloperLayout,
});

function DeveloperLayout() {
  const { data: me, isLoading } = useDeveloper();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && me && !me.isDeveloper) navigate({ to: "/", replace: true });
  }, [isLoading, me, navigate]);

  if (isLoading || !me?.isDeveloper)
    return (
      <DeveloperShell>
        <Spinner label="Checking developer access" />
      </DeveloperShell>
    );

  return (
    <DeveloperShell>
      <Outlet />
    </DeveloperShell>
  );
}
