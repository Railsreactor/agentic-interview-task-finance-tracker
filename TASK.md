# Monthly category budgets

**Type:** User Story · **Priority:** High · **Tags:** budgets, pro-upsell

## Description

As a user, I want to set a monthly spending limit per category so that I can
control my spending instead of just tracking it.

Users can currently see what they spent but have no way to plan against it.
Budgets is also one of the features we want to use to drive Pro upgrades.

## Acceptance criteria

- New "Budgets" page in the main navigation.
- User can add a budget for a category with a monthly limit, change the
  limit, and remove the budget.
- Each budget shows the limit, amount spent this month, what's left, and
  clearly shows when the user is over budget.
- A budget on a parent category includes spending in its subcategories.
- Only spending counts — income/refunds don't reduce the spent amount.
- Budgets reset every month.
- User gets an email when they go over a budget. Max one email per budget
  per month.
- Free plan: up to 3 budgets. Pro: unlimited.

## Notes

- Must not break existing functionality.
- Budgets are user data — same compliance requirements as the rest.
