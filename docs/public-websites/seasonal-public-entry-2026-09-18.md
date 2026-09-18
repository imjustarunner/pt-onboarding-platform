# Seasonal public entry pages

Public join, support and registration pages now use separate tenant-colored HTML rails and security/help footers over clean scenic photographs. The sidebar becomes a top panel on mobile. Legacy image paths and image-aligned support offsets are normalized; custom uploaded backgrounds and intentional version-2 footer settings remain supported. Registration block movement is constrained to its content column so saved desktop offsets cannot cover the sidebar.

The regular, fall and winter photographs provided in `assets/WelcomeImages` are encoded as quality-84 WebP files under `frontend/public/assets/WelcomeImages/scenic`. `regular1` through `regular5` correspond, in order, to the September 18 ChatGPT images timestamped 01_09_23, 01_09_30, 01_09_33, 01_09_36 and 01_10_03 PM. Fall and winter filenames retain their original numbering. There are 13 images, approximately 3.8 MB total. Existing Denver seasonal selection and daily rotation apply.

Join us is prominent in mental-health site navigation and first in the support sidebar. Organizations with multiple configured intake services receive an illustrated service chooser; single-service organizations go directly to that service. Service selection preserves source/program/referral query parameters. NLU currently offers Counseling and Learning Services. No services from the reference mockup were invented.

Validation: focused join, design, asset selection, service chooser, NLU navigation and TISI audience tests; production frontend build; read-only browser checks against public configuration on desktop and mobile, including both ITSCO quick and full registration entry. Form submission, login, session handling, backend services, DNS and load-balancer configuration are outside this change.
