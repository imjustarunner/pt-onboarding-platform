# Public website support and organization directory

Public websites now show the managed organization directory and ownership relationships, Plotline and Storyline service divisions, and a contact form that creates support tickets. ITSCO lists published providers without requiring available appointment slots; the production dataset returned 26 providers, including 18 with office service or assignment.

Website ticket conversations render the original encrypted inquiry after authorized decryption. Queue rows identify the originating website with its name, logo and color. New ITSCO inquiries route to Rachel Finch (getting started, school partnership, careers), Hannah Inyart (insurance/billing; billing topic), or Michael Mendez (website help). Existing claims are retained. Manual public replies use an active sender belonging to the ticket agency and report delivery failure or missing configuration. Kimi uses the existing PlotTwistCo support address with user authorization.

## Manual local chat

The website widget offers chat to approximately Colorado-located visitors when an authorized support/admin employee is available. Google load balancer headers provide the approximate state; unknown or nonlocal visitors keep the contact forms. Staff see per-website visitor toasts, can switch/dismiss conversations, and insert seeded quick replies before manually sending. An unanswered visitor message displays an inquiry fallback after 60 seconds.

Sessions use hashed random visitor tokens, website binding, two-hour expiry, encrypted message storage, staff agency authorization, CAPTCHA and rate/message limits. Raw IPs are not stored in chat tables; an HMAC of the day and IP supports rate limits. Expired sessions older than seven days are purged in bounded batches when new sessions start. Region is an eligibility hint, never authorization. No automated staff replies are sent.

## Applied configuration

- Migration 1450: website identities/relationships, ticket website attribution and chat tables.
- Migration 1451: approved Kimi support sender, reusing PlotTwistCo's sender address without changing inbound email routing.
- Existing `plottwist-api-backend` custom request headers: `X-Website-Region:{client_region_subdivision}` and `X-Website-Client-IP:{client_ip_address}`. No URL-map, DNS, app/QV routing or cookie changes.
- Added the eight public root domains to the existing score CAPTCHA key's allowed domains, retaining all previous app domains and settings.
- Frontend build uses `VITE_API_URL=/api` to preserve same-origin authentication.

## Verification

- Production frontend build passes.
- Existing public page tests: 40 pass; ticket presentation/domain utility tests: 29 pass.
- Focused backend routing, encryption authorization and manual email behavior: 14 pass; sends mocked.
- Chat UI tests cover local eligibility, 60-second fallback, manual quick replies, selected visitor delivery and dismissal.
- Real database chat round trip verified encryption, wrong-website/token rejection and retry deduplication, then rolled back the synthetic fixture.
- Built-site browser checks passed on eight pages across six public domains, including nine directory cards, all division service areas, office providers, contact submission payload, mobile overflow and same-origin API requests. Synthetic form submissions were intercepted; no real visitor email or ticket was sent.
- Eight live database contact configurations resolve to their intended support agencies.

Google header reference: https://docs.cloud.google.com/load-balancing/docs/https/custom-headers-global
