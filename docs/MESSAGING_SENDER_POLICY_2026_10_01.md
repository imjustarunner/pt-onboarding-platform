# Staff email sender policy

For managed Workspace tenants and tenants with Google SSO enabled, email composed in the app uses the actual work mailbox type, independently of the user's app login method:

| Work mailbox | From | Reply-To |
| --- | --- | --- |
| Active Google Workspace user (including password-login exceptions) | Staff display name at `messages@tenant` | Their work mailbox address |
| Google Group used as an app mailbox | Staff display name at their group address | Their group address |

The existing tenant branding and staff signature pipeline receives the original staff author in both cases. Normal SSO replies therefore reach their Google mailbox; group replies continue through the existing app inbound routing. No personal email address is exposed and `ai@plottwistco.com` remains forbidden as a visible sender. Explicit department mailboxes retain their configured routing.

Conversation ownership and mailbox IDs remain personal even when the transport uses messages@. Compose, reply, reply-all, forward, and delayed delivery use the same sender resolver. The composer displays the effective From and Reply-To while retaining its original mailbox selection ID. Delivery logs record the effective Reply-To.

Directory verification coalesces requests per address and caches successful mailbox-type checks for one minute. A user-to-group conversion takes effect after this cache expires; app password overrides do not change the routing. Failed lookups and unavailable/suspended mailboxes do not silently select another sender. Gmail still requires an accepted messages@ send-as identity for SSO mail, or an accepted individual Group identity for app-only mail. This change does not add personal SSO addresses as transport send-as aliases, change Google account status, or resend prior mail.
