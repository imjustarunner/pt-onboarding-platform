# Learning Billing Operations

This document covers how to run learning subscription renewals safely in production.

## Purpose

Renewal runs do two things for due `ACTIVE` + `auto_renew = true` subscriptions:

1. Credit period tokens from the subscription plan.
2. Advance the subscription period window.

Runs are idempotent per subscription period using DB locks:

- table: `learning_subscription_renewal_locks`
- unique key: `(subscription_id, period_end_at)`

## Required Environment Variable

Set this on the backend service:

- `LEARNING_BILLING_RENEWAL_SECRET`

The internal endpoint rejects requests when this secret is missing or incorrect.

## Internal Endpoint (for cron/job runner)

- Method: `POST`
- URL: `/api/learning-billing/internal/run-renewals`
- Auth: `x-learning-renewal-secret` header

Optional body/query params:

- `agencyId` (number): limit processing to one agency
- `limit` (number): max due subscriptions to scan (default 200)

### Example: all agencies

```bash
curl -X POST "https://app.itsco.health/api/learning-billing/internal/run-renewals" \
  -H "Content-Type: application/json" \
  -H "x-learning-renewal-secret: $LEARNING_BILLING_RENEWAL_SECRET" \
  -d '{"limit":200}'
```

### Example: single agency

```bash
curl -X POST "https://app.itsco.health/api/learning-billing/internal/run-renewals" \
  -H "Content-Type: application/json" \
  -H "x-learning-renewal-secret: $LEARNING_BILLING_RENEWAL_SECRET" \
  -d '{"agencyId":2,"limit":200}'
```

## Recommended Schedule

Start with every 15 minutes:

- catches due renewals quickly
- low risk due to idempotent locking

If load is low, hourly is also acceptable.

## Response Shape

Typical response:

```json
{
  "ok": true,
  "internal": true,
  "scanned": 12,
  "renewed": 10,
  "results": [
    {
      "subscriptionId": 101,
      "clientId": 44,
      "agencyId": 2,
      "credited": [
        { "tokenType": "INDIVIDUAL", "quantity": 4 }
      ],
      "nextPeriodStart": "2026-03-01 00:00:00",
      "nextPeriodEnd": "2026-03-31 00:00:00"
    }
  ]
}
```

Skipped or already-processed periods will return result rows with:

- `skipped: true`
- `reason: "already_locked_or_processed"`

## Manual Admin Trigger (authenticated)

Admins can also run renewals from the app using:

- `POST /api/learning-billing/subscriptions/run-renewals`

This path uses the same lock/idempotency logic and is safe to run multiple times.

## Runbook Notes

- Ensure migrations are applied, especially:
  - `387_learning_billing_foundation.sql`
  - `388_learning_subscription_renewal_locks.sql`
- If renewal lock migration is not applied, system falls back to non-lock mode (temporary compatibility). Apply migration as soon as possible in production.
- Monitor for:
  - `failed: true` entries in response
  - `FAILED` rows in `learning_subscription_renewal_locks`
