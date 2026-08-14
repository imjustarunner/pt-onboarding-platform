# School client action packet

**What it is:** A branded mobile PDF + 24-hour secure link sent to school providers so they complete quick client updates (fall confirmation, new-client intake, etc.) without Google sign-in.

**Admin:** Client Action Needed workspace → expand **Send school client action packet** → PDF or Link per provider.

**Provider:** Opens PDF button or `/ca/:token` → sees client list → **Complete** opens the right modal (fall confirmation, intake checklist).

**Technical:** `providerActionOutreach.service.js`, `providerActionPdf.service.js`, bundled assets in `backend/src/assets/providerActionPdf/`. Full template: `docs/PROVIDER_ACTION_PACKET_TEMPLATE.md`.
