# Join page designer

Open `/join/:tenant`, choose a service when prompted, and select **Edit this page** on the intake welcome page. Existing admin/support authorization and tenant-access checks still apply. The designer edits this welcome page; the intake questionnaire and submission workflows remain connected to the existing application.

## Workspace

The editor has an element list, a live page canvas, and a property inspector. Choose Desktop (1440 × 900), Tablet (1024 × 900), or Mobile (390 × 844). The iframe uses those actual viewport dimensions; fit-to-canvas only scales the display. The public renderer resolves the same design data at its real viewport width: mobile through 860 px, tablet through 1100 px, desktop above 1100 px.

Select an existing element on the canvas or in the list. Reorder with drag-and-drop in the list, or the keyboard-accessible Move up / Move down buttons. Change visibility, alignment, width, typography, spacing, backgrounds, focal points, background wash, and colors. Resetting one view clears its old offsets without resetting the other views or deleting its text overrides.

The palette can add text sections, images, and link buttons. Element creation, deletion, names, and section assignment are shared across views. Order and visibility are device-specific. Optional mobile/tablet text overrides are also available for custom elements. Images require a description and a supported URL; links require meaningful text and a supported destination. Intake choices retain their real application actions, and the editor checks that at least one available intake path remains visible in each view.

Choose **Use mobile-only text** or **Use tablet-only text** before writing alternate copy. With that option off, text changes are shared across views that do not have their own overrides. Removing an override returns that view to the shared text. Empty optional text and bullet lists remain empty after save and reload.

Upload a design reference from Page & background and turn on Show mockup for comparison. Uploaded backgrounds can differ by device. Logo and support-contact changes update organization-wide branding/contact settings only when saved; the inspector explains this scope. Existing social/link-preview image controls save independently and are labeled accordingly.

Undo/redo includes element edits, additions, removals, and ordering. Closing or navigating away with unsaved work asks before discarding it. A failed save retains the editor state for retry. Save waits for uploads, uses the existing tenant/service-specific landing endpoint, and publishes changes to that welcome page; there is no separate persisted draft/version in this workflow.

## Implementation and checks

`copy.layout.design` contains a versioned design, custom element definitions, and separate desktop/tablet/mobile view settings. The existing landing update endpoint already persists layout objects, so no migration is required. Legacy layout data remains readable. Other copy keys and service records are preserved. Removed custom element text is cleared in the submitted patch so its old text does not persist as a ghost element in the public copy.

`AdaptiveJoinLanding` is the renderer for both the public page and the editor preview. Preview messages accept only the parent window at the same origin and explicit message types. Canvas clicks select elements and never start an intake. The dedicated preview route has no save endpoint or submit UI. Normal public buttons continue into the existing interest form/enrollment flow; enrollment also requires a real public intake key before its button can be enabled.

Frontend checks:

```sh
npm test --prefix frontend -- src/utils/__tests__/joinLandingTemplate.test.js src/utils/__tests__/joinPageDesign.test.js src/components/adaptive-intake/__tests__/JoinPageDesigner.test.js src/components/adaptive-intake/__tests__/AdaptiveJoinLanding.test.js
NODE_OPTIONS=--max-old-space-size=8192 npm run build --prefix frontend
```

Backend checks:

```sh
node --test --test-force-exit backend/src/services/__tests__/adaptiveIntake.landingCopy.test.js
```

Local browser verification covered independent mobile text, selection, reorder/undo/redo, custom text/image/link elements, image uploads, visibility, saving, and the resulting public mobile page. The actual `/join/tisi` route was also checked at 320, 390, 768, 1024, 1200, and 1440 px for horizontal overflow and clipped cards; the interest button opened the real form component. These checks used intercepted API fixtures. They did not publish a tenant page, upload to production storage, or submit a real intake.
