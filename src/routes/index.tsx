import { createFileRoute, redirect } from "@tanstack/react-router";


export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    if (context.user) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: context.hasUsers ? "/login" : "/setup" });
  },
});
