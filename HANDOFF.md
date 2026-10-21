# Finance Tracker — Engineering Handoff

## 1. Objective

Complete the **Monthly Category Budgets** take-home task while preserving existing application behavior and following the repository's conventions.

The implementation should be production-minded but appropriately scoped for a take-home assignment. Prioritize correctness, data integrity, security, test coverage, and a clear explanation of the design over unnecessary abstractions.

## 2. Acceptance Criteria

- Add a Budgets page to the main navigation.
- Allow users to create, update, and delete monthly category budgets.
- Display each budget's monthly limit, current spending, remaining amount, and over-budget state.
- Include descendant-category spending when calculating a parent-category budget.
- Count expenses only; income and refunds must not reduce spending.
- Recalculate spending for the current month.
- Send an email when a budget threshold is reached, with at most one successful alert per budget per month.
- Enforce plan limits: Free users can create up to three budgets; Pro users have no budget-count limit.
- Include budgets and related alert records in the existing data export and account-deletion workflows.
- Avoid regressions in existing functionality.

## 3. Implementation Summary

### Budget management
- Added budget schema and migration files.
- Added server-side budget operations in `src/server/budgets.functions.ts`.
- Integrated budget-count entitlements into `src/server/billing.server.ts`.
- Added current-month spending calculations and hierarchical category aggregation.

### Email alerts
- Added `src/server/budget-alerts.server.ts`.
- Added per-budget, per-month alert records with statuses and expiring leases.
- Implemented retry after email-provider failures and recovery of expired reservations.
- Wrapped alert processing so email failures do not propagate to transaction-writing operations.
- Integrated alert checks into transaction, import, receipt, and categorization flows.

### Data integrity and compliance
- Updated `src/db/schema.ts` and migration metadata.
- Updated compliance handling in `src/server/compliance.server.ts`.
- Corrected receipt-created transaction amounts to use the expense sign convention: `-Math.abs(data.totalMinor)`.

## 4. Concurrency and Delivery Semantics

The alert implementation uses a database reservation keyed by budget and month to reduce duplicate sends across concurrent workers. Failed sends can be retried, and expired leases can be reclaimed.

This is not a strict exactly-once delivery guarantee. If the email provider accepts a message but the process crashes before recording the successful send, a retry could produce a duplicate. Do not claim exactly-once delivery unless provider-side idempotency or an equivalent mechanism is implemented.

## 5. Validation Status

Last confirmed full unit-test run:

- **24 test files passed**
- **202 tests passed**
- Command: `pnpm exec vitest run --testTimeout=15000`

The migration and readiness tests also passed with the increased timeout.

Previously confirmed:
- `pnpm exec tsc --noEmit`
- Targeted Oxlint checks
- `git diff --check`

Known test-runner noise:
- A React/Vite `ReferenceError: module is not defined` diagnostic may appear during startup.
- Vitest may report a delayed shutdown after the tests have passed.
- The default five-second timeout was insufficient for migration/readiness tests in the full suite; increasing the timeout allowed them to pass.

**Not yet confirmed:** the official `pnpm run check` command, including end-to-end tests, and the final local UI walkthrough.

## 6. Migration Status

Migration files `drizzle/0004_budgets.sql` and `drizzle/0005_budget_alert_leases.sql`, along with their snapshots, were present as untracked files in the last `git status` output. The journal and schema files were modified.

Do not assume these files are committed or deployed. Review their contents and ordering before applying migrations to any shared or production database.

## 7. Remaining Work — Prioritized

### P0 — Verify the actual deliverable
1. Run `git status --short` and review `git diff`.
2. Inspect the new migration files and metadata, including the backfill that preserves previously sent alerts.
3. Verify the Budgets page is present in navigation and that create, update, delete, and over-budget states work in the browser.
4. Run the official `pnpm run check` command and address any actual failures.

### P1 — Final correctness review
1. Confirm that all expense-producing and recategorization flows trigger budget checks where appropriate.
2. Confirm refunds and income are excluded according to the application's established amount conventions.
3. Verify that alert processing is restricted to the budget owner's data and email address.
4. Review Free/Pro entitlement enforcement and account export/deletion behavior.

### P2 — Delivery
1. Review the final diff for unrelated changes and secrets.
2. Commit the completed feature with a concise message.
3. Follow the submission instructions provided by the recruiter or assessment platform.

Do not add unrelated features or refactor stable code without a demonstrated need.

## 8. Working Agreement for the Next Session

- Work incrementally: inspect first, make the smallest justified change, then validate it.
- Use concrete terminal commands and wait for their output before deciding the next step.
- Do not assume repository contents or claim a check passed without evidence.
- Prefer the existing architecture and project conventions over new abstractions.
- Distinguish confirmed facts, potential risks, and unverified assumptions.
- Keep explanations concise and practical, in Spanish unless English is needed for deliverables.
- Preserve the existing agent conversation history for the interview, as requested in the project README.
- Avoid running migrations against shared or production environments without confirming the intended deployment procedure.

## 9. Current Working Directory

`/Users/titoagudelo/Workspace/agentic-interview-task-finance-tracker`

Resume by reviewing the current Git state and the official check command. Do not reimplement work that is already present and validated.
