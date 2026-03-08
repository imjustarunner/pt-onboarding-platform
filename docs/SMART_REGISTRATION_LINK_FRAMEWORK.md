# Smart Registration Link Framework

## Product intent

Add a new intake-link form type, `smart_registration`, so agencies can publish registration-first digital links that support:

- single offering registration (one event/program/class)
- multi-offering selection (choose one or more from a list)
- optional intake questions before or after registration selection

This mirrors the Smart School ROI pattern (a named, programmable intake-link unit) while remaining compatible with the current intake link architecture.

## Scope and rollout posture

- **Now:** registration is configured through intake links, primarily using question/document/upload steps plus `smart_registration` form-type semantics.
- **Near term:** add a dedicated registration step/unit with dynamic catalog sources.
- **Future:** support event entities when events are fully modeled.

## Link-level behavior

`smart_registration` links should default to:

- `createClient: false`
- `createGuardian: false`
- `requiresAssignment: false`

These defaults match registration-first external flows but may be overridden per link as policy evolves.

## Registration unit model (framed design)

Introduce a new intake step type: `registration`.

Suggested `intake_steps` shape:

```json
{
  "id": "step_registration_1",
  "type": "registration",
  "registrationMode": "single",
  "sourceType": "program",
  "sourceConfig": {
    "programId": 42
  },
  "selectionRules": {
    "allowMultiple": false,
    "minSelections": 1,
    "maxSelections": 1
  },
  "ui": {
    "title": "Register",
    "description": "Select your preferred option"
  }
}
```

Recommended registration-step metadata extensions:

- `participantMode`: `any | existing_only | new_only`
- `existingLookupField`: `email | phone | client_id`
- `scheduleBlocks[]`: supports multi-day and sequential sessions
- `defaultVideoUrl`: optional class/program meeting link
- `providerUserIdsCsv`: optional provider staffing references
- `selfPay`: `{ enabled, costDollars, paymentLinkUrl, paymentProvider: "quickbooks" }`

For multi-option registration:

```json
{
  "id": "step_registration_2",
  "type": "registration",
  "registrationMode": "catalog",
  "sourceType": "manual",
  "sourceConfig": {
    "options": [
      { "id": "opt_prog_1", "label": "After-School Program", "entityType": "program", "entityId": 11 },
      { "id": "opt_class_7", "label": "Math Tutoring Class", "entityType": "class", "entityId": 7 },
      { "id": "opt_event_stub_1", "label": "Spring Info Event", "entityType": "event", "entityId": null }
    ]
  },
  "selectionRules": {
    "allowMultiple": true,
    "minSelections": 1,
    "maxSelections": 3
  }
}
```

## Source types

Supported source types for the registration unit:

- `program` (live now where program records exist)
- `program_event` (programmed event slots from shift-program sites/slots)
- `class` (live as class modeling expands)
- `event` (placeholder now; wire once event model/API exists)
- `manual` (immediate fallback with static options)

## Data capture contract

Persist registration output into intake submission payload under a stable key:

- `registrationSelections[]` with `entityType`, `entityId`, `label`, `selectedAt`
- optional `waitlistAccepted` flag per selection
- optional `selectionMetadata` for schedule/session details

This enables staff-side assignment, reporting, and follow-up even before full event support is live.

## Automatic acceptance/enrollment behavior

On finalize for `smart_registration`:

- Class selections (`entityType: class`) can auto-create class client memberships for resolved client IDs.
- Program event selections (`entityType: program_event`) can auto-assign participant access at the program level and create slot signups when slot/date context is present.
- Enrollment actions are idempotent-oriented (existing assignment/signup checks where available) and return an enrollment summary to the finalize response.

## Admin builder UX expectations

For `smart_registration` links:

- show type-specific helper copy in the intake link editor
- allow scope selection (`agency`, `school`, `program`) per use case
- allow optional intake question steps before/after registration selection
- surface source selector (`program`, `class`, `event`, `manual`) once registration step UI is added

## Public flow expectations

- begin screen copy should use registration-specific language
- signer identifies themselves, then completes registration selection
- optional intake questions can run in the same flow
- completion confirmation should reference successful registration

## Program and class embedding notes

- **Programs:** use `organizationId` + optional `programId` and/or registration step source config (`sourceType: program`).
- **Program events:** use `sourceType: program_event` with agency -> program -> site -> slot selection. Event option metadata can inherit staffing from program staff assignments and schedule shape from selected slots.
- **Classes:** use registration source config with `entityType: class` and class identifiers from learning classes as they become stable.
- **Events:** keep `entityType: event` in schema now with nullable `entityId` to avoid future data-shape migration.
- **Scheduling:** attach `scheduleBlocks` for recurring/multi-day cohorts and sequential day runs.
- **Video sessions:** store per-step/per-option `videoJoinUrl` so registrants get the correct join path.
- **Self-pay:** support optional QuickBooks payment link metadata per option (or step default), without coupling registration to class materials.
- **Providers:** include provider assignment references on the registration option so staffing can be prepared before class start.

## Acceptance criteria (phase 1)

1. `smart_registration` is a valid intake-link `form_type`.
2. Admin intake-links UI can create/edit/filter this type.
3. Public intake screens show registration-appropriate type labels/copy.
4. Registration links can already be used via question steps for single or multi-choice selection.
5. Framework is documented for dedicated registration step integration with program/class/event sources.
