import { createFileRoute } from "@tanstack/react-router";
import { PermissionsSection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/permissions")({
  head: () => ({
    meta: [
      { title: "Permission inspector · MII / MIU developer portal" },
      { name: "description", content: "Exactly what one account is allowed to reach on the platform." },
      { property: "og:title", content: "Permission inspector · MII / MIU developer portal" },
      { property: "og:description", content: "Exactly what one account is allowed to reach on the platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Permission inspector</h1>
      <PermissionsSection />
    </div>
  );
}
