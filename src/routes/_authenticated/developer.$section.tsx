import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AuditSection,
  EmailSection,
  EmergencySection,
  FlagsSection,
  HealthSection,
  IntegritySection,
  PermissionsSection,
  SearchSection,
  SecuritySection,
  SupportSection,
  ToolsSection,
  UsersSection,
} from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/$section")({
  head: () => ({
    meta: [
      { title: "Developer portal · MII / MIU platform oversight" },
      {
        name: "description",
        content:
          "Platform oversight for the MII and MIU attendance system: accounts, security, audit history, data integrity and emergency controls.",
      },
      { property: "og:title", content: "Developer portal · MII / MIU platform oversight" },
      {
        property: "og:description",
        content: "Accounts, security activity, audit history, data integrity and emergency controls in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeveloperSection,
});

const sections: Record<string, { title: string; render: () => React.ReactNode }> = {
  search: { title: "Global search", render: () => <SearchSection /> },
  security: { title: "Security centre", render: () => <SecuritySection /> },
  audit: { title: "Audit log", render: () => <AuditSection /> },
  users: { title: "Users & accounts", render: () => <UsersSection /> },
  permissions: { title: "Permission inspector", render: () => <PermissionsSection /> },
  support: { title: "Support view", render: () => <SupportSection /> },
  integrity: { title: "Data integrity", render: () => <IntegritySection /> },
  email: { title: "Email centre", render: () => <EmailSection /> },
  tools: { title: "Developer tools", render: () => <ToolsSection /> },
  health: { title: "System health", render: () => <HealthSection /> },
  flags: { title: "Feature flags", render: () => <FlagsSection /> },
  emergency: { title: "Emergency controls", render: () => <EmergencySection /> },
};

function DeveloperSection() {
  const { section } = Route.useParams();
  const entry = sections[section];

  if (!entry)
    return (
      <div className="grid gap-3">
        <h1 className="text-xl font-semibold">That section does not exist</h1>
        <Link to="/developer" className="text-sm text-primary underline">
          Back to the dashboard
        </Link>
      </div>
    );

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{entry.title}</h1>
      {entry.render()}
    </div>
  );
}
