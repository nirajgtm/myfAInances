# Subscription Detection and Cancellation Suggestions

Runs after every ingest. Updates `db/subscriptions.json`.

## Detection

A merchant is a subscription if both:
- It has charged 2+ times with consistent cadence (monthly: gaps of 28-32 days; annual: 350-380 days; quarterly: 88-95 days).
- The amounts have been constant or have changed by less than 50% across the history.

Group by `merchant_canonical`. Use trailing 24 months of history.

For each detected subscription, write a record per `core/db-schema.md`:
- `cadence`, `median_amount`, `current_amount` (most recent charge), `first_seen`, `last_seen`, `charge_count_12mo`, `monthly_cost` (current_amount if monthly; current_amount/12 if annual; etc.), `annual_cost`, `last_price_change`, `category`, `status`.

A subscription with no charge in the last 1.5x its cadence is marked `status: inactive` (not deleted; we want history).

## Cancellation suggestion tags

Compute on every run. Multiple tags can apply to one subscription.

- **`recent_price_increase`**: current_amount > median_amount * (1 + recent_price_increase_pct/100). Threshold from `config.yaml`, default 15%.
- **`overlap_streaming`** / **`overlap_cloud_storage`** / **`overlap_<subcategory>`**: 2+ active subscriptions in the same sub-category. Sub-category map lives in `categorization/default-categories.yaml`.
- **`long_untouched`**: first_seen older than 12 months AND no related-category activity from the user in the last 90 days. "Related-category activity" means non-subscription charges in the same category. Heuristic, not perfect.
- **`free_trial_jump`**: first charge was zero or below 25% of the median, and the second charge was at full price. Flag if the first full-price charge is within the last 60 days.
- **`annual_renewal_soon`**: cadence is annual, next expected charge falls within the next 30 days.
- **`idle`**: no related-category activity for 90+ days while subscription continues. Subset of long_untouched, narrower window.

Compose `suggestion_reason` (string) by joining the human-readable explanation for each active tag.

## Cancellation candidate ranking

A subscription is a "cancellation candidate" if it has at least one tag. Rank candidates by:
1. Annual cost (descending).
2. Tag count (descending).

Output the top N candidates in the period report (default N=10) plus the full list in `db/subscriptions.json`.

## Output guarantees

- Never auto-cancel anything.
- Always include the user's mute list from `personal/alerts.yaml`. Muted subscriptions still appear in `subscriptions.json` with the matching tag suppressed.

## Re-runs

Detection is deterministic given the same transaction history. Re-running over the same data must produce the same output (modulo timestamps). State in `subscriptions.json` for `status` and `user_action` is preserved across re-runs.
