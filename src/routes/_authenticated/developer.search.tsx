import { createFileRoute } from "@tanstack/react-router";
import { SearchSection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/search")({
  head: () => ({
    meta: [
      { title: "Global search · MII / MIU developer portal" },
      { name: "description", content: "Search people, cohorts, blocks, appeals and audit events across MII and MIU." },
      { property: "og:title", content: "Global search · MII / MIU developer portal" },
      { property: "og:description", content: "Search people, cohorts, blocks, appeals and audit events across MII and MIU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Global search</h1>
      <SearchSection />
    </div>
  );
}
