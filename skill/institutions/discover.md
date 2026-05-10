# discover

Notes the LLM has learned while parsing statements from this institution.
Used as additional context on subsequent ingest calls. Bullets are deduped
by string-equality; rewrite this file freely if it gets cluttered.

## Quirks observed

- Discover YTD summary CSV uses `Trans. Date` and `Post Date` headers;
  amounts positive for purchases and negative for payments/credits
  (invert to our cardholder-perspective convention).
- Discover CSV concatenates Apple Pay tokenization
  (`APPLE PAY ENDING IN <last4>`) directly onto merchant city/state
  with no delimiter; capture as `payment_method = "Mobile"` and put
  the Apple Pay token last4 in `extra`.
- Discover "AUTOMATIC STATEMENT CREDIT" entries are small reward
  redemptions categorized as "Awards and Rebate Credits".
- Discover labels credit-card payments as `DIRECTPAY FULL BALANCE`
  under the "Payments and Credits" category.
- Some merchants append a long numeric reference token directly after
  the state code with no delimiter (utility billers, recurring auto-pay
  merchants). Capture the trailing digit run as `extra.trailing_token`.
- Some merchants append an authorization-style code in the form
  `ACP<YYYYMMDD><digits>` directly after the state code (commonly
  insurance carriers). Extract as `authorization_code`.
