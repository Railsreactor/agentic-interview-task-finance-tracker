//
// Client-safe compliance constants — quoted on the public legal pages, so
// they cannot live in compliance.server.ts (routes never import server
// modules). The server-side sweep imports them from here too, keeping the
// published numbers and the enforced ones identical by construction.

/** Days between a deletion request and the irreversible hard delete. */
export const DELETION_GRACE_DAYS = 14;

/** Days the raw AI model output on receipts is kept for debugging. */
export const AI_RAW_RESPONSE_RETENTION_DAYS = 90;
