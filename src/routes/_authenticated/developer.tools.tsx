import { createFileRoute } from "@tanstack/react-router";
import { ToolsSection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/tools")({
  head: () => ({
    meta: [
      { title: "Developer tools · MII / MIU developer portal" },
      { name: "description", content: "Safely repair accounts, revoke sessions and recheck a block. Every action is recorded." },
      { property: "og:title", content: "Developer tools · MII / MIU developer portal" },
      { property: "og:description", content: "Safely repair accounts, revoke sessions and recheck a block. Every action is recorded." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Developer tools</h1>
      <ToolsSection />
    </div>
  );
}
