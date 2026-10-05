import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/receipts")({
  component: ReceiptsLayout,
});

function ReceiptsLayout() {
  return <Outlet />;
}
