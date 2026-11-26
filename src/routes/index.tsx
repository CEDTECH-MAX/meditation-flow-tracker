import { createFileRoute } from "@tanstack/react-router";
import { SignInPanel } from "@/components/SignInPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign In · Maharishi Invincibility" },
      { name: "description", content: "Sign in to your Maharishi Invincibility account for attendance, marking, administration or platform oversight." },
      { property: "og:title", content: "Maharishi Invincibility · Sign In" },
      { property: "og:description", content: "Secure access to your Maharishi Invincibility account and assigned portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignInPanel,
});
