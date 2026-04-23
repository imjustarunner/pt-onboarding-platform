# Class Presentation Dashboard Implementation Note

## Purpose

This document translates the new **Class Presentation Dashboard** concept into a repo-specific implementation starting point for PT Onboarding App.

The guiding decision for this build is:

* treat the dashboard as a **new event experience type**
* do **not** extend the older virtual tutoring interface
* integrate it into the existing Program Event flow through launch points and routing

## Product Intent

The Class Presentation Dashboard is a structured live classroom surface where:

* the slide deck drives the session,
* a linked worksheet/activity appears alongside the slide,
* each participant gets their own private response space,
* autosave is visible and continuous,
* chat, Q&A, polls, people, and raised hands live in the same interface,
* presenter video stays compact and supportive instead of dominant.

This should feel like a premium instructional workspace, not a generic video grid.

## Frontend Direction In This Repo

### Phase 1 delivered in this kickoff

This first implementation should focus on a **greenfield UI shell** that is already integrated into the app:

* add a dedicated `ClassPresentationDashboardView`
* add a dedicated `ClassPresentationBuilderView`
* let the builder operate as a reusable class template studio, not only as a single-event editor
* add a standalone route for the dashboard
* keep class authoring outside the live host room whenever possible
* link to it from existing Program Event surfaces
* support participant and presenter states through route/query-driven view modes
* treat event/class palette overrides as higher priority than default agency colors
* model the core layout:
  * live worksheet panel
  * slide presentation panel
  * engagement rail
  * compact video strip
  * bottom action bar

### What is now functional in the document layer

The dashboard now has a real fillable PDF document workflow on top of the shared Skill Builders program library:

* PDFs can be uploaded from the live class dashboard into the event's shared class/program library
* PDFs can also be curated ahead of time from the standalone class builder instead of being authored live during delivery
* staff can open a field-mapping mode and place fillable regions directly on the uploaded PDF
* mapped PDFs are reusable across repeated runs of the same overarching program because the source document remains in the shared program library
* each participant gets their own saved response instance per event plus document
* typed answers render visually on top of the PDF itself in the classroom workspace
* responses autosave through live document response endpoints
* participants can later download a filled copy of their document as a PDF with their answers burned into the original file
* a separate builder route can now manage slide plans, notes, document mappings, and slide-tied polls outside the live room
* the builder can now store reusable class templates, duplicate them, and preview them before they are attached to a live event

### What still remains follow-up work

The dashboard still has important follow-up items beyond this document workflow:

* persistent dashboard entity storage
* slide deck upload/import pipeline
* slide-to-activity authoring and persistence
* deeper Google Slides ingestion beyond URL-based embedding
* realtime poll/Q&A/chat sync
* presenter/assistant role enforcement
* attendance and engagement analytics
* staff-facing post-class response review screens
* AI-assisted document-to-field suggestions for Google Doc / PDF conversion

## Color Priority Rule

The visual system should resolve colors in this order:

1. class or event-specific palette
2. active agency or portal branding palette
3. platform defaults

Until the backend stores event-level dashboard themes, the frontend shell supports this through route-driven color overrides layered above the branding store.

## Recommended Data Model Follow-Up

### Program Event additions

Add fields similar to:

* `presentation_mode`
* `class_dashboard_id`
* `participant_video_allowed`
* `participant_video_default_off`
* `chat_enabled`
* `qa_enabled`
* `polls_enabled`
* `hand_raise_enabled`
* `work_export_enabled`
* `engagement_tracking_enabled`

### Class dashboard entity

Store:

* dashboard id
* event id
* status
* slide deck metadata
* activities
* slide mappings
* presenter settings
* engagement settings
* layout preferences

### Class document template follow-up

The current implementation reuses `skill_builders_event_program_documents` as the shared class document library and stores PDF field maps in `field_definitions`.

That gives us:

* upload once at the event/program level
* reuse across repeated classes in the same program
* a single source template for participant-specific copies
* a practical migration path for Google Docs content by rebuilding it as mapped PDFs or native activity blocks

Near-term automation path:

* export a Google Doc to PDF
* upload it into the builder or event document library
* map the fields visually
* later add AI-assisted field suggestions that propose likely answer boxes based on document layout and prompt text, with staff review before publish

### Participant response entity

The current implementation adds per-user response persistence keyed by:

* event id
* program document id
* participant user id
* response values JSON
* draft/completed state
* started timestamp
* last saved timestamp
* completed timestamp

## Routing Direction

The dashboard should remain a distinct surface instead of being buried inside the tutoring routes.

Suggested live route pattern for the UI shell:

* `/:organizationSlug/class-presentation-dashboard/:eventId`
* `/class-presentation-dashboard/:eventId`

Suggested builder route pattern:

* `/:organizationSlug/class-presentation-builder/:eventId`
* `/class-presentation-builder/:eventId`
* `/:organizationSlug/class-presentation-builder`
* `/class-presentation-builder`

Launchers from event surfaces can pass role/state hints through query params until backend mode resolution exists.

## UI Requirements Preserved In This Kickoff

The first implementation must preserve these non-negotiables:

1. Slides and worksheets are directly connected.
2. Each participant has an individual workspace.
3. Video is secondary to the learning experience.
4. Presenter video stays compact.
5. Engagement tools live inside the classroom.
6. The feature is reached from Program Event flows.
7. Styling follows the platform’s blue/green direction.
8. Save continuity is always visible.

## Immediate Next Backend Steps

1. Add a `presentation_mode` field to Program Event create/edit flows.
2. Add dashboard configuration read/write endpoints.
3. Persist event-level document attachments and slide-to-document mappings instead of relying on dashboard selection state.
4. Add live session state endpoints for current slide, current activity, release state, and raised hand queue.
5. Add role-aware launch resolution so `Join Class` automatically opens the correct live classroom mode.
6. Add staff review/export screens for participant document responses and completion history.
