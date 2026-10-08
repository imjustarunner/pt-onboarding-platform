# Plotline website

Public address: **https://plottwistco.com/plottline**. The two-t path is intentional. `plotlinepo.com` remains the future product domain.

The site includes Home, Product, Solutions, Careers, Resources, About, Pricing, and Get Started. It uses the supplied Plotline brand assets, Sora/Inter fonts, and established $199 / $149 / $129 monthly prices. The calculator includes 25 active employees and adds $4 per additional employee. Demo requests use the existing public business intake with the `people` service and an explicit Plotline request description; they do not activate or charge a subscription.

## Real product examples

All interface examples are browser captures of existing application Vue components: hiring dashboard, onboarding roster, employee learning, onboarding checklist, employee evaluations, public careers, and the multi-organization hiring pipeline. Visitors can enlarge the captures. Capture URLs include their image hash so a refreshed example bypasses browser and CDN caches; the capture script maintains `src/content/plotlineExampleVersions.json`. Every example is labeled as an actual product screen with fictional records.

No customer account, applicant information, or live API is used. `frontend/scripts/plotline-capture` mounts the unchanged application components with local fixtures; writes are disabled. The capture browser blocks network requests outside its local server. `frontend/public/assets/plotline/examples/provenance.json` records each source component and its hash. Original brand-kit interface concept crops are not shipped.

To refresh captures, start Vite from `frontend` with `npx vite --config scripts/plotline-capture/vite.config.mjs`, then run `node scripts/capture-plotline-examples.mjs`. Set `CHROME_PATH` when Chrome is installed elsewhere. The capture fixture is a developer tool and is not a production entry point.

## Build and release

The ordinary frontend `npm run build` creates the standalone marketing bundle and includes it in the same production image. Exact PlotTwistCo Nginx locations serve those pages; the marketing entry does not load the staff application or change authentication. Legacy `/plotline` URLs redirect to the canonical HTTPS address. Plotline is listed in PlotTwistCo's six-product catalog, primary navigation, and footer. The homepage leads with Plot Twist HQ, followed by a rotating six-product spotlight that starts with HQ. The complete product catalog appears farther down the homepage, also with HQ first. The spotlight includes direct product selection, previous/next and pause controls, pauses on hover or keyboard interaction, and starts paused for reduced-motion preferences. The service divisions are Workforce Operations and Strategic Operations; Plotline is the people operations product within Workforce Operations. The old division and subsidiary service brand labels are removed from public copy without changing legal entities or agreements.

Publishing occurs through the existing main-branch frontend deployment workflow. This replaces the earlier temporary image overlay with a reproducible source-controlled release. The broader in-app Plotline rebrand, dedicated-domain setup, subscription activation, and cross-product SSO are separate workstreams.

Validation: `node scripts/plotline-website.test.mjs` after the frontend build checks real-screen provenance, removal of concept images, pricing, all eight pages, and canonical hosting rules. `scripts/verify-plotline-site.mjs` checks all pages at desktop and mobile widths, the enlarged screen viewer, filters, downloads, pricing, and a mocked request/retry flow. It never sends a real test inquiry.

## Public careers directory

The Careers page at `/plottline/careers` and the homepage/product directory link to the configured ITSCO and Next Level Up careers pages. The public partner directory and careers APIs were checked on October 7, 2026; these were the two public organizations with saved careers-page branding and published roles. Generic unconfigured pages, missing agencies, and demonstration records are not advertised as established careers sites. `src/content/plotlineCareers.js` is the curated directory; add organizations after verifying their public configuration and destination. Cards use the organizations’ existing logos and link to their live pages without duplicating job postings. Public careers pages carry a subtle linked Plotline credit below the organization’s contact controls.

## Recruiting includes the careers page

Careers pages are presented as the included public entry point to recruiting across Home, Product, Solutions, Careers & recruiting, and Pricing. The shared recruiting overview connects the branded online presence to applications, interviews, hiring, and onboarding. The customer directory remains available as live examples, with a clear route for people looking for roles. Every plan explicitly includes the careers-page feature; custom implementation services remain separately scoped.

## Production photography

The enlarged mockup crops are replaced with detailed editorial visuals created using the built-in image_gen tool from the supplied references. Native dimensions are preserved in quality-92 WebP files under `frontend/public/assets/plotline/website/photos/production`: portrait (1536×1024), team (1536×1024), plant (1254×1254), and panoramic mountain journey (2172×724). No artificial upscaling is applied. The banner uses a directional contrast gradient so the copy stays readable and the scene remains visible. These are brand illustrations in photographic style; actual product examples remain the existing captured application screens. The exact prompts, references, and tool provenance are in that folder’s `provenance.json`.
