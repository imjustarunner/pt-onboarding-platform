# Scheduling follow-up — November 18, 2026

## Supervision cancellation

The cancellation confirmation used z-index 10003 while the existing appointment editor used 10200. Clicking Cancel created the confirmation behind the editor; closing the editor exposed it. The confirmation now teleports to the body or the active fullscreen calendar, above the editor. Keyboard focus enters the confirmation, stays inside it, and returns to the opener when it closes.

Review remains clickable while fields are incomplete. It marks and explains the missing responsible party and/or reason, focuses the first missing field, and does not submit anything. Cancellation still requires the separate review and confirmation step. The existing single/future scope, notifications, authorization, and server errors remain intact.

## December 3 time discrepancy

The user reports that both the calendar and editor show 10 AM for an intended 5 PM session for client 2031 on December 3, 2026, with 99051 displayed. In Denver:

| Intended local start | UTC instant |
| --- | --- |
| December 3, 5 PM MST | December 4, 00:00 UTC |
| December 3, 10 AM MST | December 3, 17:00 UTC |

This is a seven-hour difference. It is consistent with a UTC/wall-clock error but does not establish the stored record's history or cause. A saved add-on or clinical billing decision alone does not establish the intended appointment time. The current schedule policy distinguishes the two instants; synthetic tests verify that the 10 AM instant does not receive the evening-time suggestion.

The editor now compares its original calendar entry with the canonical appointment returned by the existing authorized appointment API. A disagreement displays both date/time ranges in the same calendar timezone and asks the user to confirm the intended time. It does not choose an authoritative record or silently adjust either one. If both saved records were shifted together, this comparison cannot recover the original intent.

A separate quarter-hour label error used undefined `h` and `m` variables. It now formats the parsed date's hours and minutes.

## Validation and access limits

Regression coverage uses synthetic fixtures, including December 3 calendar placement, edit fields, passive reads without PATCH/POST, mismatch warnings, 99051 schedule interpretation, required-field validation, recurrence scope, server errors, and fullscreen/focus behavior. The appointment flow exercises provider, admin, and support roles. The focused suites run under UTC, Denver, New York, and Auckland process timezones. Local desktop and mobile Chrome checks verify the actual dialog is above an open editor, highlights missing fields, and completes review/confirmation with synthetic data.

No live appointment was read or modified in this follow-up. Cloud SQL identity metadata showed only built-in database accounts; no scoped automation database identity was available. The repository's identity rules prohibit substituting a human application session or an application superadministrator. A production record audit remains outstanding through an authorized access path.

The required evidence is the target appointment's UTC start/end and persisted source timezone, its linked provider/office calendar times and clinical-session times, the original creation/edit audit events, and relevant UTC migration markers. Broader checks should count missing links and linked-time mismatches and review recent scheduling changes around six-/seven-hour offsets. Synchronized shifts require comparison with original audit evidence; matching linked times alone cannot prove intent. Preserve original records and audit history, and do not rerun completed UTC migrations or bulk-shift appointments based on a clock offset.
