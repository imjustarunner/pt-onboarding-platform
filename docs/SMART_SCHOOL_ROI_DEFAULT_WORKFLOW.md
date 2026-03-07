# Smart School ROI Default Workflow

This project uses a single standard Smart School ROI workflow for school release-of-information consent.

## Product Intent

- The Smart ROI is the default school ROI experience.
- The signer receives a guided, interactive, step-by-step flow.
- School data and school staff are auto-loaded from system data.
- Signed decisions are enforced as application permissions.

## Default Selection Rules

When opening a client's School ROI section, the system resolves the Smart ROI in this order:

1. School-specific Smart ROI (if active and eligible)
2. Agency default Smart ROI available through affiliated school organizations

No manual per-client assignment is required for normal use.

## Link and Send Options

From the client School ROI section:

- Create and copy client-specific signing link
- Start signing session immediately
- Regenerate signing link
- Send ROI link by SMS
- Send ROI link by email
- View copyable full and short links once issued

## Interactive Consent Flow

The public Smart ROI flow includes:

1. Intro and identity details
2. Purpose of release
3. Required acknowledgements (one at a time, mandatory)
4. Release/waiver categories (one at a time)
5. Packet visibility decision
6. Individual staff approval/denial decisions
7. Guidelines and disclosure limitations
8. Term and revocation terms
9. Signature and completion

## Data and Enforcement

The workflow stores and applies:

- School context and auto-populated school details
- Client and signer identity details
- Required acknowledgement outcomes
- Category-level release decisions
- Per-staff allow/deny decisions
- Packet visibility approval
- Signature, signed timestamp, and expiration behavior

After signature, staff access is applied per decision:

- Approved + packet allowed -> `roi_docs`
- Approved + packet denied -> `roi`
- Denied -> `none`

## Compliance and Logging

The signed flow and related actions are designed to support:

- Disclosure minimization and authorization boundaries
- Access and disclosure logging
- HIPAA-aware messaging in signer-facing content
- Revocation terms and support contact disclosure
