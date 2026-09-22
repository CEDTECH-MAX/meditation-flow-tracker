import { createFileRoute } from "@tanstack/react-router";
import { IntegritySection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/integrity")({
  head: () => ({
    meta: [
      { title: "Data integrity · MII / MIU developer portal" },
      { name: "description", content: "Orphaned records, missing cohorts, duplicates and cross-institution mix-ups." },
      { property: "og:title", content: "Data integrity · MII / MIU developer portal" },
      { property: "og:description", content: "Orphaned records, missing cohorts, duplicates and cross-institution mix-ups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Data integrity</h1>
      <IntegritySection />
    </div>
  );
}
