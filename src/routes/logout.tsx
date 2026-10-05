import { createFileRoute } from "@tanstack/react-router";
import { logout } from "#/server/auth.functions";


export const Route = createFileRoute("/logout")({
  preload: false,
  loader: () => logout(),
});
