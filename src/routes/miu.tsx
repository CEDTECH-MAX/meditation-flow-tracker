import { createFileRoute } from "@tanstack/react-router";
import { SignInPanel } from "@/components/SignInPanel";

export const Route = createFileRoute("/miu")({
  head: () => ({
    meta: [
      { title: "MIU Sign In · Maharishi Invincibility University" },
      {
        name: "description",
        content:
          "Sign in to the Maharishi Invincibility University portal for meditation and class attendance, with an 80% minimum requirement per block.",
      },
      { property: "og:title", content: "Maharishi Invincibility University Attendance" },
      {
        property: "og:description",
        content:
          "Meditation and class registers for MIU, including attendance type, behaviour comments and credits owed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SignInPanel institution="MIU" />,
});
