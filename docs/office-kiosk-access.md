# Shared office kiosk access

Entry addresses:

- `https://kiosk.auricwell.com/`
- `https://kiosk.plottwisthq.com/` (same feature, including organizations that do not use the EHR)
- `https://plottwisthq.com/office-kiosk` while the dedicated hosts are being connected

For both new hosts, configure DNS, HTTPS certificates, and the existing load balancer: `/api/*` goes to onboarding-backend, all other paths go to onboarding-frontend. This change prepares both frontend hostnames; it does not modify DNS, certificates, or the load balancer. No additional hostname is needed when a building is added.

An administrator opens Scheduling → Building Settings, selects the building, and uses **Kiosk access → Create six-digit code**. Each building can have one independently generated code, including buildings used by several agencies. A code is shown once and must be saved privately. Enter it on the shared device, then add the page to its home screen. The app is named **AuricWell Kiosk**, with a **Kiosk** short label and its own blue/gold check-in terminal icon. Existing installations may need to be removed and added again to refresh their cached icon.

The cookie, not the URL, selects the building after setup. Old Windchime and Denver links use the same setup gate. The existing app remains the source for office assignments, bookings, providers, check-ins, and feedback; no Google account or EHR enrollment is required for office kiosk access.

## Access boundaries

- Six digits are generated with cryptographic randomness; leading zeros are supported. Plaintext codes are not stored or returned later. Each record contains a salted scrypt hash and a purpose-separated HMAC lookup keyed by `OFFICE_KIOSK_CODE_SECRET`, falling back to the existing `JWT_SECRET` (minimum 32 characters). Changing this key requires replacing office codes.
- Successful setup creates a separate 256-bit random device token. Only its SHA-256 hash is stored. The production cookie uses the `__Host-` prefix, HttpOnly, Secure, SameSite=Strict, and no Domain attribute. It is never placed in localStorage, a URL, or a staff JWT.
- Saved access lasts 365 days and renews daily when used. Clearing browser data, switching domains, administrator revocation, code replacement, office archival, or a year without use requires setup again. Idle visitor reset clears the visitor's UI, not the device's access.
- Server middleware protects office schedule, directory, provider, check-in, feedback submission, support, and legacy availability/reservation URLs. A device cannot change the location ID to access another building. Staff client charts, feedback histories, billing, and administration still require their own staff login. The kiosk retains only its existing public-facing provider fields and check-in status, without patient names or response histories.
- Setup and kiosk mutations reject cross-site requests. Shared MySQL counters cap setup attempts at 5 per source IP per 15 minutes, 100 across all IPs per hour, and 500 per day. Counts include successful attempts and survive backend restarts. Rate-limited users receive a generic error; no building identity is revealed for a wrong code. A fleet-wide limit can temporarily delay setup under attack; already-connected devices remain usable.
- Administrators with access to the building can revoke individual devices. Replacing its code changes a credential revision, invalidating all prior devices, including a setup that races code replacement. Every protected request checks current access; open kiosks clear themselves on the next failed request or one-minute session check.

Migration `1609_office_kiosk_device_access.sql` creates the three access tables. Codes are provisioned deliberately by administrators, not hardcoded or emailed. Existing kiosk devices need their building code once after this release. New hosts require a separate one-time setup because host-only cookies are intentionally not shared between domains.

Validation: office kiosk regression suites, code hashing/guess limits/scoping/revocation tests, browser setup and session restoration, production frontend build, and deployment health checks. Do not send real check-ins or notifications to test access control.
