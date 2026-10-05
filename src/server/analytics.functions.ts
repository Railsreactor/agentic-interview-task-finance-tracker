import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "#/server/session";
import {
  getDashboardSummaryInternal,
  getSpendingSankeyInternal,
  getSpendingOverTimeInternal,
} from "./analytics.server";


// --- Schemas ---

const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/;

const periodSchema = z.object({
  from: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  to: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  accountId: z.string().optional(),
});

// --- Server Functions ---

/**
 * Fetches high-level dashboard summary: total income, expenses, net, and top spending categories.
 */
export const getDashboardSummary = createServerFn({ method: "GET" })
  .inputValidator(periodSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return getDashboardSummaryInternal(userId, data);
  });

/**
 * Fetches spending data formatted for a Sankey diagram: 3-level flow from accounts to categories to subcategories.
 */
export const getSpendingSankey = createServerFn({ method: "GET" })
  .inputValidator(periodSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return getSpendingSankeyInternal(userId, data);
  });

/**
 * Fetches monthly spending data broken down by category for bar/line charts.
 */
export const getSpendingOverTime = createServerFn({ method: "GET" })
  .inputValidator(periodSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return getSpendingOverTimeInternal(userId, data);
  });
