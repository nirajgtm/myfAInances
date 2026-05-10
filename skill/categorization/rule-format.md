# Rule Format

Both `default-rules.yaml` and `personal/categorization.yaml` use this schema.

## Schema

```yaml
rules:
  - priority: 10                          # integer; lower = higher priority
    description_regex: "(?i)\\bUBER\\b"   # tested against transaction.description_normalized
    category_id: rideshare                # must exist in db/categories.json
    tag_subscription: false               # optional; if true, transaction is also marked as a subscription candidate
    tax_tag: null                         # optional; one of: interest | dividend | capgain | mortgage_int | charity | hsa
    accounts: ["<account_id>"]            # optional; restrict rule to specific account ids
    amount_range: { min: null, max: null }# optional; restrict by signed amount
```

## Matching semantics

- Rules are merged across `default-rules.yaml` and `personal/categorization.yaml`, then sorted by `priority` ascending.
- First rule whose `description_regex` matches AND whose optional restrictions are satisfied wins.
- Regex must use Python regex syntax. Case-insensitive flag should be inside the regex via `(?i)`.

## Validation on load

- `category_id` must resolve to an entry in `db/categories.json`. If not, log a warning and skip that rule.
- `tax_tag` must be one of the allowed values or null.
- Invalid regex makes the entire file fail to load. The skill aborts and asks the user to fix.

## Conventions for default rules

- Generic merchants only. Anything with a personal merchant (your local coffee shop) goes in `personal/categorization.yaml`.
- Use word boundaries (`\b`) liberally to avoid accidental substring matches (e.g., "AMEX" matching "AMEXICA").
