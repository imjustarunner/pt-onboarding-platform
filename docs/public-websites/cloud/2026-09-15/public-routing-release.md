# Public domain routing release and authentication correction

Public mappings: itsco.health -> /p/itsco (canonical www); nextleveluplcc.com -> /p/nlu; plottwistco.com -> /p/ptco; theinnerstrengthinstitute.com -> /p/tisi; risereviveco.com -> /p/rise; mh4kidz.org -> /p/mh4kidz; mentalrange.org -> /p/range; kimicain.com -> /p/kimi. Exact-host history adaptation leaves app and QV route identities unchanged. Website Nginx servers serve the built SPA and redirect direct login URLs to app hosts.

23 routing tests passed, production Vite build passed with NODE_OPTIONS=--max-old-space-size=8192. All eight live public page headings were verified diagnostically while TLS was still provisioning.

## Authentication incident

The first manual release incorrectly used the Cloud Run service environment VITE_API_URL as the build argument. The actual existing GitHub production workflows use VITE_API_URL=/api. This caused cross-site API requests and reported user login failures. Rolled traffic back to onboarding-frontend-02502-nmw immediately, then confirmed live app API origin was app.itsco.health again.

The corrected v4 image is built with VITE_API_URL=/api and restores services/api.js exactly to its original source. Browser checks of the corrected built assets show same-origin requests and expected pages for app.itsco.health, qv.app.itsco.health, plottwistco.com and www.itsco.health, with no JavaScript errors. Authenticated login requires an actual user session and has not been tested with user credentials.

Image: us-west3-docker.pkg.dev/ptonboard-dev/onboarding-frontend/onboarding-frontend:public-domains-20260915-v4
Build: 0d6ad673-76a0-46be-8764-ef6769cc8b0e

The runtime release overlays compiled JS/CSS, index and generated public Nginx configuration on the original production image afc3b0d3c723a229814c66f9c4939c480f570548, preserving its static assets. Future source builds must retain the existing GitHub /api build argument. Do not use runtime Cloud Run VITE_API_URL environment as the build-time value.

User explicitly approved Cloud Build compute service-account Artifact Registry Writer on only onboarding-frontend repository after automatic approval rejected the inferred grant. Applied that repository-scoped permission; no broader IAM roles changed.

Created and attached public-www-20260915 preserving current user-attached certificates. Its domains validated and certificate became ACTIVE. User's root-domain certificate websitecertificates was still PROVISIONING at last pre-incident check. No app/QV DNS or URL-map changes performed by this release.
