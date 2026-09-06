import { createFileRoute } from "@tanstack/react-router";
import { SignInPanel } from "@/components/SignInPanel";

export const Route = createFileRoute("/mii")({
  head: () => ({
    meta: [
      { title: "MII Sign In · Maharishi Invincibility Institute" },
      {
        name: "description",
        content:
          "Sign in to the Maharishi Invincibility Institute meditation attendance portal. Students track block attendance; administrators mark sessions.",
      },
      { property: "og:title", content: "Maharishi Invincibility Institute Attendance" },
      {
        property: "og:description",
        content: "Meditation attendance for MII, with the 80% block requirement calculated live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SignInPanel institution="MII" />,
});
