# Plotline website

Public address: **https://plottwistco.com/plottline**. The two-t path is intentional. `plotlinepo.com` remains the future product domain.

The site includes Home, Product, Solutions, Resources, About, Pricing, and Get Started. It uses the supplied Plotline brand assets, Sora/Inter fonts, and established $199 / $149 / $129 monthly prices. The calculator includes 25 active employees and adds $4 per additional employee. Demo requests use the existing public business intake with the `people` service and an explicit Plotline request description; they do not activate or charge a subscription.

## Real product examples

All interface examples are browser captures of existing application Vue components: hiring dashboard, onboarding roster, employee learning, onboarding checklist, employee evaluations, public careers, and the multi-organization hiring pipeline. Visitors can enlarge the captures. Every example is labeled as an actual product screen with fictional records.

No customer account, applicant information, or live API is used. `frontend/scripts/plotline-capture` mounts the unchanged application components with local fixtures; writes are disabled. The capture browser blocks network requests outside its local server. `frontend/public/assets/plotline/examples/provenance.json` records each source component and its hash. Original brand-kit interface concept crops are not shipped.

To refresh captures, start Vite from `frontend` with `npx vite --config scripts/plotline-capture/vite.config.mjs`, then run `node scripts/capture-plotline-examples.mjs`. Set `CHROME_PATH` when Chrome is installed elsewhere. The capture fixture is a developer tool and is not a production entry point.

## Build and release

The ordinary frontend `npm run build` creates the standalone marketing bundle and includes it in the same production image. Exact PlotTwistCo Nginx locations serve those pages; the marketing entry does not load the staff application or change authentication. Legacy `/plotline` URLs redirect to the canonical HTTPS address. Plotline is listed in PlotTwistCo's six-product catalog, primary navigation, and footer. The full product catalog appears immediately after the homepage hero. The service divisions are Workforce Operations and Strategic Operations; Plotline is the people operations product within Workforce Operations. The old division and subsidiary service brand labels are removed from public copy without changing legal entities or agreements.

Publishing occurs through the existing main-branch frontend deployment workflow. This replaces the earlier temporary image overlay with a reproducible source-controlled release. The broader in-app Plotline rebrand, dedicated-domain setup, subscription activation, and cross-product SSO are separate workstreams.

Validation: `node scripts/plotline-website.test.mjs` after the frontend build checks real-screen provenance, removal of concept images, pricing, all seven pages, and canonical hosting rules. `scripts/verify-plotline-site.mjs` checks all pages at desktop and mobile widths, the enlarged screen viewer, filters, downloads, pricing, and a mocked request/retry flow. It never sends a real test inquiry.
