import { createFileRoute } from "@tanstack/react-router";
import { UsersSection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/users")({
  head: () => ({
    meta: [
      { title: "Users & accounts · MII / MIU developer portal" },
      { name: "description", content: "Account status, roles, institution, cohort, last sign-in and account repairs." },
      { property: "og:title", content: "Users & accounts · MII / MIU developer portal" },
      { property: "og:description", content: "Account status, roles, institution, cohort, last sign-in and account repairs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Users & accounts</h1>
      <UsersSection />
    </div>
  );
}
