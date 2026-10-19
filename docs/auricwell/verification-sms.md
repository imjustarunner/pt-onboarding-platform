# AuricWell verification texts

AuricWell owns this platform-level 2FA campaign. It is separate from each agency's
appointment, form, billing, account and provider-message campaigns. A dedicated
AuricWell sender is required; agency senders cannot be selected for verification.

## Enrollment and review

Public entry: https://auricwell.com/account/text-verification (redirects to the
deployed standalone AuricWell application). The public page is the actual
enrollment component. A user signs in before requesting enrollment, enters a US
mobile number, checks the initially unchecked consent box, and chooses **Send
verification code**. A six-digit code verifies possession before enrollment becomes
active. Existing enrolled security methods must be verified before changing a
number. Account security is available from the practice sidebar and login screen.

Consent matches the October 17 AuricWell Account Verification submission:

> I agree to receive verification codes by text from AuricWell when I request them.
> Message frequency varies based on my requests. Msg & data rates may apply. Reply
> STOP to opt out or HELP for help. See Terms and Privacy Policy.

The Terms and Privacy Policy link to the documents on auricwell.com. The mobile
number is optional when using another security method. Consent to verification
does not subscribe the user to agency messages or marketing.

The public screen explicitly says when text verification is awaiting activation.
Screenshots of that state demonstrate the implemented form, not working carrier
delivery or an approved campaign. They must not be edited to hide this state.

## Platform activation

1. Apply `1663_auricwell_verification_sms.sql` before deploying the backend.
2. Open Platform Settings → AuricWell account verification. Save the dedicated
   number, 2FA campaign ID, approval status and carrier approval reference.
3. In Notifyre, configure the submitted standard START, STOP and HELP responses
   shown in platform settings, then confirm that configuration in the app. Notifyre
   sends these standard responses; the application does not duplicate them.
4. Verify number ownership through the existing Notifyre connection and complete
   signed webhook verification. The shared callback is
   `/api/auricwell-sms/webhook`. SMS received and SMS sent are required.
5. Enable requested verification texts only after approval and verification. The
   agency SMS switch can remain off; this campaign is independent.

No API token is sent to the browser. Existing Secret Manager credentials and the
recorded BAA are reused. Changing the API token disables number verification.

## Authentication and recovery

Codes expire in ten minutes, are session-bound for sign-in/enrollment, and are
single-use. Only a keyed digest is stored. Phone numbers and consent evidence are
encrypted. Persistent per-account/phone limits allow at most ten requests per day,
at least sixty seconds apart. A code allows five guesses; aggregate failed guesses
also limit new requests. HTTP rate limits additionally apply to recovery and auth.
An ambiguous transport response is not retried automatically. If a code arrives,
it can still be entered. No carrier message body or code enters the clinical inbox.

Recovery requires a previously verified, enabled number and a user request. Its
public response does not reveal whether the username exists. Successful code
verification issues a short-lived, single-use password reset token; resetting the
password preserves MFA and expires previous sessions. SMS recovery does not grant
a signed-in session. Authenticator and email recovery remain available.

STOP takes effect through the signed callback and shared Notifyre phone suppression
state; it invalidates outstanding verification codes. START restores eligibility
for already-consented verification, without enrolling any new account or sending a
code automatically. Users may also turn off verification texts after verifying
their account. Suppression is checked again when verifying a code.

Sources: [Notifyre registration requirements](https://support.notifyre.com/how-to-register-your-10dlc-campaign)
and [Notifyre SMS API](https://docs.notifyre.com/api/sms-send).
