# Categorization

Categories are a controlled vocabulary. The registry is `db/categories.json`. Seeded from `default-categories.yaml` plus `personal/categories.yaml` overrides at init. AI may extend the registry, but only after the dedup check below.

## Three layers, in order

For each transaction with `category == null`:

### 1. Rule layer

Iterate rules from:
- `default-rules.yaml` (this directory) and
- `personal/categorization.yaml` (user overrides)

Merged and sorted by `priority` ascending. First regex that matches `description_normalized` assigns the category. Set `categorized_by: "rule"`, `category_confidence: 1.0`.

### 2. Alias layer

If still uncategorized, look up `merchant_canonical` (set during ingest from `personal/aliases.yaml` and the auto-built `db/merchants.json`). If the canonical merchant has a stable category in `db/merchants.json` (most common category seen for this merchant in past transactions, with at least 3 occurrences), apply it. Set `categorized_by: "alias"`, `category_confidence: 0.9`.

### 3. AI layer

For everything still uncategorized after layers 1 and 2:

1. Batch the remaining transactions.
2. Send to the model with: the transaction (description, amount, merchant, account type) AND the full current category list (id, name, aliases, example_merchants).
3. Instruct the model to either:
   - **Pick an existing category id**, OR
   - **Propose a new category** with id, name, parent, and 1-line justification.

#### Dedup check before adding a new category

When the model proposes a new category:
- Compute a similarity score against every existing category. Use the model itself or a simple heuristic: case-insensitive substring overlap on `name` and `aliases`, plus semantic similarity (model judgment) on close matches.
- If similarity exceeds 0.75 against an existing category: reject the proposal, force the model to pick the existing one. Log a "dedup-prevented" line.
- If the closest match is a `frozen` category: always reject. Force the model to use it.
- If similarity is below 0.75 across all categories: accept. Append to `db/categories.json` with `created_by: "ai"`, `created_at: now`. Add the originating transaction's merchant to `example_merchants`.

#### Confidence

Use the model's own confidence. Anything below 0.6 stays `category=null` and is surfaced in the report under `data_quality.uncategorized_count`.

## Re-categorization

The user can ask for a re-categorization pass at any time. When that happens:
- Transactions with `categorized_by: "manual"` are NEVER touched.
- Transactions with `categorized_by: "rule"` or `"alias"` are re-evaluated only if rules or aliases changed since their last categorization.
- Transactions with `categorized_by: "ai"` may be re-evaluated if the category list changed.

## When the user adds or merges categories

If the user merges category A into B:
1. Update every transaction with `category == A` to `category == B`. Preserve `categorized_by`.
2. Mark category A as `merged_into: B` in `db/categories.json` (do not delete the record; preserves history).
3. Re-run the report for any affected period.
