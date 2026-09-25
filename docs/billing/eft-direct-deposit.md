# EFT direct deposit and ERA setup

September 25, 2026: the agency owner reports that **TISI already receives CCHA direct deposits**. Preserve this working enrollment. This report is distinct from bank-deposit verification inside the application; no bank statement was inspected and no live enrollment or banking instruction was changed.

## What each setup does

| Setup | Purpose | TISI / CCHA status |
| --- | --- | --- |
| Contracting / credentialing | Payer participation | Agency reports active from September 15, 2024 |
| EDI claims | Electronic claims delivery | Verify separately through the existing Claim.MD setup |
| ERA (835) | Payment, adjustment and denial explanation | Confirm delivery to Claim.MD independently |
| EFT (ACH) | Deposit payer funds into the agency bank account | Existing direct deposits reported by the owner |
| Reconciliation | Match the remittance to the actual deposit and claims | Staff verification required; not inferred from an accepted claim or ERA |

CCHA directs EFT enrollment and banking changes to [EnrollSafe](https://enrollsafe.payeehub.org/). Its May 2026 [provider manual, page 16](https://www.cchacares.com/Dal/ebM) describes matching the payment trace to the 835. The app links to that portal; it does not submit bank instructions through Claim.MD.

## What TISI needs now

1. Retain the existing CCHA EFT enrollment and bank destination. Do not re-enroll merely because the clearinghouse is changing.
2. Confirm the enrollment applies to TISI's tax identity and group NPI **1306688650**, including the Windchime billing setup. Determine whether the payer enrollment covers the entire TIN or selected NPIs.
3. After deployment, open Billing Workspace → Payers & ERA → TISI → **EFT / direct deposit**. Record “Direct deposits reported,” agency/staff report, and a dated reference to the owner's confirmation. This does not require bank account numbers.
4. Billing staff can then match a real deposit to the payer's payment/trace reference and record “Bank deposit verified by staff,” with the evidence date. Save the evidence reference rather than uploading a bank statement here.
5. Complete or verify CCHA's separate ERA enrollment to Claim.MD. Check the first ERA and associate it with its actual deposit. Keep monitoring the existing remittance channel during the transition.

Claim.MD's [Quick Start Guide](https://docs.claim.md/docs) explains that ERA enrollment can reroute the selected NPI/TIN's remittances to Claim.MD. Do not mistake successful ERA routing for a new EFT enrollment or proof that funds cleared.

## For a new payer or new legal/group identity

Confirm the payer's official EFT process and the authorized person's access. In EnrollSafe, registration and EFT enrollment are separate. Its [official guide](https://enrollsafe.payeehub.org/content/pdf/EnrollSafe_User_Reference_Manual.pdf) calls for provider/contact information and a W-9 for registration; enrollment requires routing/account information, a bank verification document, and the authorized signer's name/title and electronic signature. Enter those in the secure portal.

EnrollSafe supports TIN-level enrollment for a shared bank destination and NPI-level enrollment where NPIs need different destinations. Confirm all intended NPI associations. The portal warns that a new enrollment can replace historical instructions, so review its scope before submitting. A new office does not automatically establish a new EFT destination.

The app conservatively tracks each agency/payer/group-NPI/tax-identity combination. Offices sharing that identity use one record. For a payer's TIN-wide enrollment, record its coverage evidence for each relevant group rather than assuming every NPI is enrolled. Another agency never inherits EFT verification merely because it shares a management company or Claim.MD account.

## Implemented application behavior

- Dedicated EFT panel in both Payers & ERA and Payments, plus company overview and cross-company work items.
- Separate statuses: not verified, not enrolled, pending, action needed, deposits reported, bank deposit verified by staff, and suspended.
- Agency financial access rules apply server-side. A clinical or billing supervisor without financial access cannot view EFT evidence.
- Billing NPI and tax identity come from the authorized agency's office profile, not browser-supplied identifiers. Changed identities show review required.
- Encrypted evidence with dated source, portal scope, attestation, editor and immutable revision history; competing edits require a refresh.
- Bank-deposit verification requires a staff attestation that an actual deposit matches this payer/entity. ERA alone cannot set that status.
- No bank account or routing-number fields. No money movement, accounting posting, automatic payer enrollment, or automatic bank-feed verification is performed by this tracker.
- EFT status is independent from Claim.MD claims, ERA and eligibility callbacks. A missing app record means “not recorded,” not “EFT inactive.”

Deploy main migration **1487_payer_eft_tracking.sql** after the existing billing migrations. No production migration was applied in this change. The tracker uses the existing family-billing encryption key and tenant financial permissions; no new bank API secret is required.

Verification: unit tests cover evidence requirements, stale identities, revision conflicts, encryption and scope; Vue tests cover reported versus verified status and tenant navigation; disposable MySQL tests exercise concurrent creation, shared NPI identity, immutable evidence and cross-tenant isolation. External bank/payer submissions are not part of these tests.
