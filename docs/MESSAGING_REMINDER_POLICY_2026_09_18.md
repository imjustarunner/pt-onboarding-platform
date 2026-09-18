# Messaging reminder policy — September 18, 2026

## Recipients

- SSO users receive no personal-email reminders for ordinary email: their work mailbox already receives that email.
- Secure-message reminders go to the SSO login/work address, never `personal_email`. The same recipient guard covers the future `hub_sms_unread_digest` template; this does not enable SMS delivery.
- Personal fallback requires an active, non-demo provider with both password-login and Group-login flags, an actual Google Group login, and no Workspace user for that login. Directory verification fails closed. A password override alone is insufficient.
- Personal fallback respects the provider's preference and agency setting. These preferences do not disable secure-message reminders to an SSO work address.
- Both outbound sender entry points recheck the current account before sending a messaging reminder, including an old queued reminder. Additional Cc/Bcc recipients are prohibited.

## Timing

The saved 24/48-hour settings now mean one/two scheduled business days, not 24/48 accumulated working hours.

- Use the provider's Availability Hours and time zone. The default is Monday–Friday, 7 a.m.–7 p.m.; saved custom schedules remain intact.
- Mail received at or after 5 p.m. starts its response window at the next available opening. This cutoff preserves the requested Monday 6 p.m. example while expanding delivery hours to 7 a.m.–7 p.m.
- Earlier mail outside availability starts at the next opening. Advance by the chosen number of available days at the same local time, then defer to the next available block if necessary.
- Friday 4 p.m. → Monday 4 p.m.; Monday 6 p.m. → Wednesday 7 a.m. under the default schedule. A one-minute scheduler checks eligibility, so actual dispatch can follow by approximately a minute, subject to service/provider delays.
- Split schedules, custom working days, and daylight-saving changes are honored. Turning off general notification quiet hours does not remove the reminder's business-day protection.

## Content and duplicate prevention

Personal reminders say “You have messages waiting” without the original subject or body. Their sign-in link targets the conversation. Direct replies still use the provider's work identity and original thread.

Per-message claims prevent duplicate personal reminders, including held/failed sends. Secure digests claim an attempt before sending so a held/failed delivery cannot generate an alert every minute. A database scheduler lock prevents overlapping workers. Historical held reminders are not reset or resent by this change.

## Verification

- 121 messaging backend tests passed, including recipient checks, actual branded email validation, both timing examples, custom schedules, DST, and duplicate claims.
- 6 Availability Hours tests passed.
- 14 frontend Quick View/availability tests passed.
- Frontend production build checked separately.

Deployment troubleshooting was deferred at the user's request. A commit/push is not evidence that the new backend policy is live.
