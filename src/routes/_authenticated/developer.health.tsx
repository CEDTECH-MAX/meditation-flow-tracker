import { createFileRoute } from "@tanstack/react-router";
import { HealthSection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/health")({
  head: () => ({
    meta: [
      { title: "System health · MII / MIU developer portal" },
      { name: "description", content: "Database, authentication, storage and email status with recent problems." },
      { property: "og:title", content: "System health · MII / MIU developer portal" },
      { property: "og:description", content: "Database, authentication, storage and email status with recent problems." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">System health</h1>
      <HealthSection />
    </div>
  );
}
