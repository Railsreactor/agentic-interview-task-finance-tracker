import { createFileRoute, redirect } from "@tanstack/react-router";


export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: context.hasUsers ? "/login" : "/setup" });
    }
  },
});
