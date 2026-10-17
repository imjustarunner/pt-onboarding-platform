# Practice billing and FundThred finance

FundThred is PlotTwistCo’s finance division and product, not a newly created legal entity. Its services page is `/fundthred/services`; the collections entrance is `/fundthred/app/collections`. The dedicated host uses `/services` and `/app/collections`. PlotTwistCo services content also describes payroll, billing support, reviewed collections, and financial oversight. Payroll breakdowns identify the employing agency alongside FundThred. This presentation change does not create a new statutory payslip, alter payroll calculations, or replace externally issued payroll documents.

## Sending identities

Routine insurance-card follow-ups, payment-setup invitations, and practice account statements use the originating agency’s `billing@` sender. They do not switch to a collections identity because a balance is overdue. The existing review, consent, reconciliation, and duplicate-send controls remain in effect.

`ai@plottwistco.com` is the delegated transport account and a member of each configured group. Gmail must report the practice send-as alias as `accepted`; From and Reply-To use the practice address. Canonical Workspace accounts are resolved before comparing membership, so Hannah’s and Kaitlyn’s ITSCO aliases match their PlotTwistCo accounts. Only explicit billing grants and the provisioning superadmin are candidates for new human memberships. Billing access does not subscribe every platform administrator to group email.

Existing group owners, roles, and posting settings are preserved by provisioning. Unrecognized recipients block activation for administrator review. New groups start private with member-only posting; inbound external reply permissions require a separate Workspace review. Directory 403 responses are not interpreted as nonexistent groups. The provisioning path does not send test or patient email. Google may issue its own verification email if an alias requires ownership verification.

`collections@fundthred.com` is reserved under PlotTwistCo agency 1 using `fundthred_collections`. Other practices cannot provision that identity or take over its inbound route. Its sender record can remain pending until the domain and sending alias are verified. Ordinary billing never falls back to this address.

## Collections boundaries

The workspace reuses the existing management collections handoff and financial ledger. Billing permissions list authorized organizations; separate collections permissions and `FAMILY_COLLECTIONS_ENABLED` control case access. No agreements, fees, legal authority, collections permissions, referrals, messages, or payments are inferred or activated by adding the workspace or sender. Follow [management collections handoff](management-collections-handoff.md) for the existing handoff and the remaining communication/settlement limitations.

The public service description is scoped by agreement and does not claim licensing or a separate collections company. Before activating collections communications, review the actual service scope, applicable licensing, disclosures, contact preferences, and agreements. Colorado distinguishes creditors collecting their own debts from regulated collection activity; naming the service a division does not determine its legal status. See the [Colorado Attorney General’s collection agency program](https://coag.gov/office-sections/consumer-protection/consumer-credit-unit/collection-agency-regulation/). Sender verification behavior is documented by [Google’s Send-as API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs/create).

## October 17 configuration

- Existing billing groups verified: PlotTwistCo, ITSCO, Next Level Up, Inner Strength.
- PlotTwistCo, ITSCO, and Next Level Up: named billing staff plus relay configured; accepted send-as and practice Reply-To verified.
- Loriana’s app billing access remained off; her membership was removed only from the three reviewed billing groups, following the owner’s prior instruction.
- Inner Strength: domain recorded, sender held for review of Haley’s existing owner membership. No ownership was removed.
- FundThred: Google Directory reported `Domain not found`; central sender record prepared but not activated.

Load the intended environment, then preview with `node backend/src/scripts/configurePracticeBillingSenders.js`. Apply with `--apply --actor-user-id=501`; `--agency=2` selects one of the reviewed agencies. The script confirms agency slugs and uses the named team IDs. It never removes group members. Future group changes should be reviewed against current explicit access before applying.
