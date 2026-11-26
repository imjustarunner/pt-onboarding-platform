PLOTLINE HIRING WEBSITE — FICTIONAL CAPTURE HARNESS

This is a local development utility. It is not a public app route and is not
imported by the Plotline marketing bundle. It does not log into any application.
Never replace its fixtures with production tokens, sessions, names or records.

With existing dependencies and Chrome available, from the repository root:
  node frontend/scripts/plotline-hiring-capture/server.mjs
  node frontend/scripts/plotline-hiring-capture/capture.mjs
  node frontend/scripts/plotline-hiring-showcase.test.mjs

The harness listens on 127.0.0.1:5212. It uses the current applicant view,
reference form, and HirePortalWorkspace. Only media tiles, transcript capture,
API calls and unopened nested pre-hire steps are replaced with local fixtures.
All images and copied application-source hashes are stored in:
  frontend/public/assets/plotline/examples/hiring-showcase/

The interviewer mockup is supplied separately by the user and must stay marked
as a fictional mockup. It is not relabeled as an actual production screenshot.
The applicant view uses video placeholders so an image editor can add fictional
faces. The clean version leaves the shared question unfilled. No video SDK,
camera, microphone, live invitation, signature or submission is used.

Optional PLOTLINE_CAPTURE_REVIEW_DIR retains duplicate review images and the
capture receipt outside the temporary checkout. Preserve original user files.

Build the standalone website, then preview it locally:
  node frontend/scripts/build-plotline-site.mjs
  PLOTLINE_PREVIEW_PORT=5213 node frontend/scripts/preview-plotline-site.mjs
  node frontend/scripts/plotline-hiring-capture/verify-site.mjs

PLOTLINE_TEST_ORIGIN defaults to http://127.0.0.1:5213. PLOTLINE_REVIEW_DIR chooses
the browser evidence folder (default /private/tmp/plotline-hiring-site-checks).
Browser checks block non-GET calls and off-origin requests. They never submit
the inquiry form or join an actual interview. Stop both local servers afterward.

Publication belongs to the separate release chat. These commands do not deploy.
