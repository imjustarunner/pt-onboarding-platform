We initially set up an employee lifecycle, agencies, and internal communications because this was ONLY an onboarding program. We will now be executing a complete overhaul because with this as a foundation, we’ll be able to enhance our programmatic structure.

What Needs to Be Edited / Replaced in This Overhaul
Below is a surgical edit list so this doesn’t feel overwhelming.

1. REMOVE / DEPRECATE
❌ Drag-and-drop document uploads for:
I-9
W-4
Any structured government form
❌ Manual reminder processes (emails, spreadsheets)
❌ Any document-based permission logic handled manually
2. ADD / MODIFY DATABASE TABLES
✅ UserDocuments

Add expiration_date
Add is_blocking

✅ Audit log entries for document actions

✅ Optional: GeneratedDocuments (for AcroForm outputs)

3. ADD NEW SYSTEM COMPONENTS
🆕 AcroForm Wizard UI (HTML-based)


🆕 PDF mapping service (pdf-lib)


🆕 Signature Certificate generator


🆕 Daily compliance cron job


🆕 Document Compliance Dashboard (Admin)



4. UPDATE PERMISSION & NAVIGATION LOGIC
Modify navigation rendering:


Hide Schedule if blocking document expired


Update middleware:


Check document compliance before route access


Ensure:


Compliance checks occur after user status, before feature access



5. NOTIFICATION SYSTEM UPDATES
Add document-specific templates:


“Credential Expiring”


“Access Restricted Due to Expired Document”


Use:


Google Email API


Twilio SMS (throttled)



6. UI / UX UPDATES
Replace “Upload Document” buttons with:


“Complete Form”


“Update Credential”


Add:


Credential expiration indicators (green / yellow / red)


Read-only W-2 locker



7. SECURITY & COMPLIANCE CHECK
Ensure:


PDFs are flattened


Audit logs are immutable


Access is role-scoped


No school/client crossover



8. RECOMMENDED IMPLEMENTATION ORDER
Credential tracking + blocking logic


Document dashboard + cron job


AcroForm generation pipeline


Signature certificate system


W-2 locker


Navigation + permission enforcement






Alpenglow hub will be the new title but we don’t have to hard code that. That’s my option to change things like we have discussed. 





Platform Restructure & School Portal Plan
1. Core Structural Change: organization_type
The existing Agency model will be retained exactly as-is in function and behavior, but it will now be categorized under a new top-level variable called organization_type.
Supported Organization Types:
Agency
No functional changes
Continues to operate exactly as it does today
School
New organization type with school-specific portals and permissions
Program
Used for standalone initiatives (e.g., Summer Skills Program)
Learning
Reserved primarily for one tutoring-focused company
Similar to Program, but with highly specialized, learning-specific functionality
This change allows the system to scale cleanly without breaking or modifying existing agency behavior.

2. Splash Pages & URL Structure
Each organization will have its own branded entry point and navigation structure.
URL Pattern:
/{organization_slug}/login  
/{organization_slug}/dashboard  
/{organization_slug}/upload  
/{organization_slug}/new_account  
The slug is the first-level route and determines:
Branding (logo, colors, background)
Organization context (Agency vs School vs Program, etc.)
Which workflows and permissions are available
New Account Experience:
New accounts arrive via a secure tokenized link
They are prompted to create a password
All routes load the same splash page layout, styled dynamically based on the organization’s branding

3. School Splash Page (Public-Facing Entry)
Each School slug routes to a branded splash page with three clear actions:
Option 1: Digital Link – New Client Intake
Directs to a digital intake workflow (details handled elsewhere)
Designed for ease of referral without login friction
Option 2: Upload New Referral Packet (No Login Required)
School staff upload a referral packet directly
Upload is:
Locked to that school
Secure and restricted
System uses Google Vision / OCR to extract relevant data
Automatically:
Creates a new client profile
Marks it as Pending Approval
School staff can:
See that a referral exists
View very limited metadata only
No clinical, billing, or sensitive data is exposed
Admin-facing view allows:
Easy copy/paste of parsed fields
Quick posting into the EHR (until integration exists)
Option 3: School Staff Login
Opens a modal login window
Authenticates staff with school-level credentials
Routes into the School Portal (restricted view)

4. School Portal Functionality
4.1 Bulk Importer (Legacy Migration Tool)
Purpose: One-time or periodic data migration
Admin uploads a legacy CSV (e.g., ~600 rows)
System logic:
Auto-creates Client Profiles
Assigns each client to:
The correct School (Organization)
The appropriate Provider
Eliminates manual re-entry and setup

4.2 Restricted School View (Privacy-First Design)
When a school (e.g., Rudy Elementary) logs in:
They see only their students
Displayed in a clean, simple data grid
Visible Columns:
Student Status
Assigned Provider Name
Admin Notes (non-clinical)
Strictly Hidden Columns:
Billing information
SSNs
Clinical notes
Any protected health or financial data
This ensures FERPA/HIPAA-aligned visibility without overexposure.

4.3 Referral Pipeline (End-to-End Workflow)
Goal: Eliminate email chains and referral uncertainty
Flow:
School Counselor clicks “Refer Student”
Completes a digital referral form
Agency Admin sees “Incoming Referral”
Admin assigns referral to a clinician
School receives notification: “Accepted”
Resulting Benefits:
Clear handoff
Status transparency
No more “Did you get my referral?” emails
A single, trackable referral pipeline

5. Overall Outcome
This structure:
Preserves all existing agency functionality
Introduces scalable organization types
Creates school-specific workflows without exposing sensitive data
Reduces administrative friction
Lays the foundation for future EHR integration
The system becomes modular, privacy-safe, and expansion-ready.

IMPORTANT: Each provider can be assigned to a school. A schedule will be available to view who is working during what hours at what school. See new schedule later. 




Client Management Module — Structured Plan (Replaces Excel Workflow)
A) Purpose
Build a Client Management module that replaces the legacy Excel/CSV process, supports:
Agency-side full visibility and management
School-side restricted visibility and actions
A clear referral → pending → active → archived pipeline
A notes/comments system with internal-only controls
Bulk import tooling with deduping + smart matching

1) Core Data Model (Schema + Relationships)
1.1 Organizations (already implied by your platform plan)
Organizations are typed by organization_type:
Agency
School
Program
Learning
Each client is associated to:
A School organization (the school they attend)
A Provider (an employee/user assigned to them)
Key rule: Client records are always created in the context of an Agency + School relationship (even if the school is the “owner” of the portal view).

1.2 Clients Table (Primary Record)
Table: clients
Core Fields (minimum viable):
id
organization_id (School org)
agency_id (Agency org — see “permission checks” section)
provider_id (User/employee assigned; nullable while pending)
initials (for school view; may be derived from full name stored separately)
status (see Status Model below)
submission_date (when referral/import was submitted)
document_status (intake packet state, OCR state, etc.)
Recommended supporting fields (to avoid future pain):
source (BULK_IMPORT | SCHOOL_UPLOAD | DIGITAL_FORM | ADMIN_CREATED)
created_by_user_id
updated_by_user_id
last_activity_at

1.3 Client Audit Trail (Who changed what, when)
Table: client_status_history (or a general audit_log)
id
client_id
changed_by_user_id
field_changed (status, provider_id, etc.)
from_value
to_value
changed_at
note (optional; why change was made)
This is essential for disputes and workflow tracking.

1.4 Client Notes / Comment System
Table: client_notes
id
client_id
author_id
message
is_internal_only (true = agency-only)
created_at
Rules:
Agency users can post internal or shared notes.
School staff can post shared notes only.
School staff never sees internal notes.
UI:
Add a “Messages” tab in the client detail side panel.
Optional: display “Internal” badge for agency-only notes.

2) Client Status Model (Think Hard Section)
You already have employee lifecycle statuses. Clients need something simpler but still robust.
2.1 Suggested Client Statuses (Practical + Minimal)
Client statuses should reflect the business pipeline:
PENDING_REVIEW
Created by import/upload/form
Needs agency approval or validation
May not have provider assigned yet
ACTIVE
Approved/accepted
Visible to school with basic fields
Normal operational state
ON_HOLD
Temporarily paused (missing docs, unable to contact, waiting on consent)
Still visible, not archived
DECLINED
Referral rejected (not appropriate fit, duplicates, wrong school, etc.)
Still kept for audit trail; restricted visibility
ARCHIVED
Fully closed / inactive historically
Read-only for most roles
If you want even leaner: PENDING_REVIEW → ACTIVE → ARCHIVED (+ optional DECLINED)
2.2 Document Status (separate from Client status)
Keep this separate so you don’t overload status.
Recommended document_status examples:
NONE
UPLOADED
OCR_PROCESSING
OCR_COMPLETE
NEEDS_CORRECTION
APPROVED
REJECTED
This prevents “status” from trying to represent both “client pipeline” and “paperwork pipeline.”

3) Bulk Importer (Migration + Ongoing Utility)
3.1 Migration Upload
Admin uploads the legacy “600-row CSV.”
3.2 Parsing Logic
For each row:
Find School Organization by name (or mapped ID)
Determine Agency context (who owns/partners that school)
Create or update a Client record
3.3 Smart Matching / Deduping Rules
Match key (recommended):
agency_id + organization_id (school) + initials
If match found:
Update selected fields (status/provider/submission_date/document_status)
Append to audit history (bulk import update)
If no match:
Create a new record
You can later extend smart matching (DOB, student ID), but initials+school+agency is the MVP you described.

4) UI + Permissions Views
4.1 Agency-Side Data Grid (Full View)
Agency staff can see ALL clients across ALL schools that belong to that agency.
Data grid requirements:
Sort/filter/search
Inline edit:
status
provider_id
Bulk actions (future): archive, assign provider, export
Recommended UI behavior:
Row click opens client detail side panel:
status history
messages tab
document status + upload history

4.2 School Portal View (Restricted)
When a School Admin or School Staff logs in:
They see only their students.
Backend filter (non-negotiable):
WHERE organization_id = req.user.organization_id
API response must not include sensitive fields at all.
Return only:
initials
status
provider_name
submission_date
(optional) document_status if useful to the school
School can:
Comment (shared notes)
Upload referral packets
View minimal status/provider assignment
School cannot:
See billing/SSN/clinical notes
See internal notes
Edit provider assignment (unless you explicitly allow later)

5) User Types, Employee Types, and Permission Resolution
5.1 User Types (High-Level Categories)
These are for your internal organization/knowledge layer:
employee (your staff)
client
school_staff
5.2 Employee Types (Roles within employee user_type)
super_admin
admin
staff (replaces support)
provider (replaces prior provider-like roles)
supervisor (a flag/attribute that can apply to any of the above)
Treat supervisor as an attribute/permission add-on, not a separate silo.
5.3 Client vs Guardian
User type:
client
guardian (flag similar to supervisor)
Rules:
Guardian is linked to a specific client
Guardian is the signer/consenter for the dependent
Guardian permissions always route “through” the client they represent

5.4 Permission Checking Order (Your Rule, Formalized)
When evaluating permissions, the system must always resolve in this order:
Agency context first
What agency “owns” the data / relationship?
What agency is the user operating under?
User Type
employee vs school_staff vs client/guardian
Role / Employee Type
super_admin/admin/staff/provider (+ supervisor attribute)
Organization Scope
school portal gets hard filter by school organization_id
agency portal gets scope to agency-owned/connected orgs
This prevents a “role” from accidentally granting access across the wrong agency boundary.
5A) User Categorization vs Status (Critical Distinction)
To avoid status confusion and permission bugs, the system must separate three concepts:
User Category (who this person fundamentally is)
Role / Attributes (what they can do)
Lifecycle Status (whether they can access the system)
These must never be overloaded into one field.

5B) User Categories (Top-Level Classification)
Every authenticated account belongs to exactly one user category:
1. EMPLOYEE
Internal agency staff.
Subject to employee onboarding lifecycle
Can have roles (admin, provider, supervisor, etc.)
Always associated with an agency

2. CLIENT
Represents access to client-facing functionality.
Clients do not go through onboarding or employment states.
Client Attributes:
is_guardian (boolean)
false → the client themselves (if age/appropriate)
true → a guardian accessing on behalf of a dependent
attached_client_id
Required when is_guardian = true
Points to the child/dependent client record
Guardians are always the legal signer for documents
This allows:
One guardian + one child account
Two guardians for the same child
A client who later becomes their own signer

3. SCHOOL_STAFF
School-side users.
Never go through onboarding lifecycle
Permissions are organization-scoped to their school
Cannot cross agency boundaries
Capabilities:
Comment on clients (shared notes only)
Upload referral packets
View restricted client lists

5C) Role & Attribute Layer (Applies After Category)
Employee Roles (only if user_category = EMPLOYEE)
super_admin
admin
staff
provider
Supervisor
Boolean attribute
Can apply to any employee role
Grants additional review/oversight permissions

Client Attributes (only if user_category = CLIENT)
is_guardian
attached_client_id
Guardians:
Never act independently of the client they represent
All permissions resolve through the attached client

5D) Lifecycle Status Models (Separated by Category)
Employee Lifecycle Status (Already Defined)
Applies only to EMPLOYEE users:
PENDING_SETUP
PREHIRE_OPEN
PREHIRE_REVIEW
ONBOARDING
ACTIVE_EMPLOYEE
TERMINATED_PENDING
ARCHIVED
These statuses:
Control authentication access
Gate routes at middleware level
Have no meaning for clients or school staff

Client / Guardian Account Status (Simpler Model)
Applies to CLIENT users only:
Recommended:
ACTIVE
INACTIVE
LOCKED (optional – legal, consent, or safety hold)
Clients/guardians:
Are never “onboarding”
Are never “terminated”
Are never “archived” in the employee sense

School Staff Account Status
Applies to SCHOOL_STAFF users:
Recommended:
ACTIVE
DISABLED
Controlled entirely by school or agency admin.

5E) Permission Resolution (Updated, Explicit Order)
When evaluating permissions, the system must resolve in this order:
Agency Context
Which agency owns the data?
Which agency does the user belong to?
User Category
EMPLOYEE vs CLIENT vs SCHOOL_STAFF
Lifecycle Status (if applicable)
Employees: must be ACTIVE_EMPLOYEE
Clients: must be ACTIVE
School staff: must be ACTIVE
Role / Attributes
Employee role + supervisor flag
Client guardian flag
School staff scope
Organization Scope
Schools → hard filter by school organization_id
Agencies → access to owned/partnered organizations

5F) Why This Matters (Design Rationale)
This structure:
Prevents clients from accidentally inheriting employee logic
Allows guardians without duplicating client records
Supports future client portals and consent workflows
Keeps permissions predictable and debuggable
Avoids “status explosion” bugs later
This is the minimum clean separation needed to scale safely.

6) Employee Status Lifecycle (Access Control States)
You already defined a strong employee lifecycle. Here it is organized as the canonical state machine:
Invite — PENDING_SETUP
Admin enters email & sends invite
Has token, no password yet
No app access besides password creation
Pre-Hire Open — PREHIRE_OPEN
User sets password & logs in
Restricted access: only pre-hire tasks/forms
Pre-Hire Review — PREHIRE_REVIEW
User or admin marks “Pre-hire Complete”
Blocked access: “Please contact the agency team.”
Onboarding — ONBOARDING
Admin assigns onboarding package
Active but limited: onboarding trainings only
Full Access — ACTIVE_EMPLOYEE
Admin marks onboarding complete
Full access based on role
Offboarding — TERMINATED_PENDING
Admin marks terminated
Grace period: access expires in 7 days automatically
Archived — ARCHIVED
Auto after 7 days or manual archive
Login revoked
Key implementation note:
These statuses should directly drive authentication/authorization gates (middleware-level), not just UI.

7) School Staff Capabilities (Explicit)
School staff can:
Upload referral packets (no-login upload is separate; logged-in upload is fine too)
View restricted client list for their school
Post shared comments (non-internal notes)
See referral acceptance status + assigned provider name
School staff cannot:
See internal notes
See hidden data fields
See clients outside their school
Manage employees or platform settings

8) End-to-End Flows (How It Works in Real Life)
8.1 New Referral via School Upload (No Login)
School uploads packet to {school_slug}/upload
OCR extracts data
System creates Client record:
status = PENDING_REVIEW
document_status = OCR_PROCESSING → OCR_COMPLETE
Agency admin approves/assigns provider
Client becomes ACTIVE and school sees “Accepted”
8.2 Bulk Import Flow
Admin uploads CSV
System creates/updates clients
Status history entries logged
Agency view shows all; schools see only their filtered rows
8.3 Messaging Flow
School posts a note → agency sees it
Agency posts internal note → school does not see it
Agency posts shared note → school sees it

9) Deliverables Checklist (Build Order)
Tables:
clients
client_notes
client_status_history (or audit_log)
Bulk importer backend utility:
CSV parsing + smart matching
Agency data grid:
list, filter, inline edit (status/provider)
School portal restricted list:
strict backend filter + column exclusion
Client detail side panel:
status history + messages tab
Permission middleware:
agency-first resolution + user_type + role gates
Employee status gates:
enforce lifecycle access rules at login + route level
Integrated Operations Platform Plan
(Office Scheduling · Kiosk · Communications · Notifications · Compliance)

1. Architectural Principles (Global Rules)
No new Organization Types
Everything here lives inside the Agency portal
Schools, Programs, etc. are consumers—not owners—of these features
Permission-Driven Visibility
Features appear only if the user:
Belongs to the correct organization
Has the correct permissions
Is not restricted by status, role, or document compliance
Privacy by Design
No client names on public displays
No personal phone numbers exposed
All external-facing routes are read-only or token-protected

2. Office Scheduling Module (“Space Manager”)
2.1 Navigation & Visibility
Add “Schedule” to Agency top navigation
Conditionally rendered if:
user.permissions.can_book_rooms === true OR user is Admin
AND user is not Telehealth-only
Telehealth-only users:
Never see the tab
Never load scheduling routes

2.2 Location-Based Scheduling
Location Selector (Required First Step)
Dropdown populated from OfficeLocations table
Scheduler UI is not rendered until a location is selected
All room queries scoped to that building

2.3 Office Marketplace (Core UI)
Interactive map with real-time status:
🟢 Green → Available
🔴 Red → Occupied (assigned)
🟡 Yellow → Released / Pending / Sublet
Supports:
Permanent ownership (recurring assignments)
Ad-hoc bookings
Temporary release (vacation / out of town)

2.4 “Out of Town” / Release Switch
Permanent room owners can:
Select date range
Click “Release My Room”
System converts Red → Yellow for those dates
Other users may request the slot (approval required)

2.5 Request & Approve Workflow (CPA Gatekeeper)
Database
RoomRequests
user_id
room_id
type (ONE_TIME | RECURRING | PERMANENT)
status (PENDING | APPROVED | DENIED)
dates
User Flow
If room is unowned or released:
“Book” → “Request Booking”
Slot immediately turns Yellow (Pending)
CPA / Admin Flow
“Room Approvals” dashboard (CPA role)
View all pending requests
Actions:
Approve → creates assignment (Green)
Deny → frees slot
Notifications
Approval triggers:
In-app notification
Email (Google API)
Optional SMS (Twilio)

2.6 Read-Only Status Board (“Hallway View”)
Route: /agency/schedule/board/:locationId?key=ACCESS_KEY
No login required
Read-only
Shows:
Room
Clinician name only
No client data
Designed for:
Hallway monitors
Front desk reference
Quick phone checks

2.7 Print & Export
Button: Export PDF
Options:
Today
This Week
Uses:
jspdf
jspdf-autotable
Format:
Time | Room | Clinician
Print-ready, front-desk friendly

3. Clinical Kiosk (Patient Engagement)
3.1 Public Kiosk Route
Route: /kiosk/:locationId
Touch-friendly UI
No patient names stored or displayed

3.2 Slot-Based Identity (Privacy Core)
Identity is derived from:
Provider
Date
Time slot
PIN (MMDD of DOB)
Slot Signature Example:
WED-1700-0512
No PHI displayed on screen.

3.3 Kiosk Flow
Select Provider (who has an office assignment today)
Select Time Slot
Enter 4-digit PIN
Complete Survey (PHQ-9 / GAD-7)
Submit → Check-In recorded

3.4 Survey Engine
Surveys Table
provider_id
slot_signature
date
answers (JSON)
score
Features:
Automatic scoring
Longitudinal storage
PDF export for EHR upload

3.5 Real-Time Check-In
On submission:
Create CheckIn record
Emit socket event
Provider dashboard:
Slot turns Green
Indicates patient is in lobby

3.6 Provider Slot View
Provider selects:
Recurring slot (e.g., Mondays @ 9am)
System queries:
All surveys matching Provider + Slot + PIN
Displays:
Line graph (score over time)
Export:
One-click PDF summary

4. Communication Center (Twilio + Google API)
4.1 Masked Messaging (Privacy)
Staff text via web portal
Clients receive messages from system number
Personal phone numbers never exposed

4.2 Database
Users
system_phone_number
MessageLogs
direction (INBOUND | OUTBOUND)
body
from_number
to_number
user_id
client_id
timestamp

4.3 Inbound SMS Webhook
POST /api/twilio/webhook
Flow:
Identify Staff owner of To number
Save message to conversation
Attach client initials (Caller ID lookup)
Emit real-time UI update

4.4 Support Safety Net
On inbound SMS:
Notify:
Primary clinician
All users with is_support_staff = true
Support notifications:
In-app only
No SMS forwarding
Feed: “All Recent Texts”

4.5 Quiet Hours Gatekeeper
UserPreferences
notification_schedule_enabled
allowed_days
start_time
end_time
Logic:
Inside hours → send push/SMS
Outside hours → suppress
Exception:
URGENT flag
Emergency override

4.6 After-Hours Auto-Responder
Custom message per user or org
4-hour loop breaker
Still logs message
Still alerts support team
Message example:
“I’m currently out of the office. My support team has been notified. If this is an emergency, dial 911 or 988.”

5. Emergency Broadcast & Compliance
5.1 Emergency Broadcast System
Admin UI:
Filters:
Organization
Role
Appointment date
Delivery:
SMS + Email
Throttled (50 at a time)

5.2 Document Compliance Enforcement
UserDocuments
expiration_date
is_blocking
Daily Cron Job:
Notify at:
30 days
14 days
1 day
Hard Block:
If blocking doc expired:
Disable Schedule access
Prevent room booking

6. How This All Connects
Schedule drives:
Kiosk availability
Hallway boards
Compliance gating
Kiosk feeds:
Provider dashboards
Longitudinal outcomes
Twilio ensures:
No client goes unheard
Support oversight
Notifications enforce:
Boundaries
Safety
Professionalism
This is a single operational ecosystem, not disconnected features.

7. Recommended Build Order
Office Scheduling (Core + CPA approvals)
Read-only Board + PDF Export
Twilio Messaging + Safety Net
Quiet Hours + Auto-Responder
Kiosk Check-In + Surveys
Emergency Broadcast + Compliance Locks









Documents Overhaul
The Paperwork Engine (Onboarding, Compliance & Audit Automation)
Purpose
Replace the current drag-and-drop document workflow with a structured, auditable, automation-first system that:
Generates government-grade forms correctly
Tracks credential expiration automatically
Enforces compliance through permission gating
Centralizes secure document access for staff
This system applies primarily to EMPLOYEES, with limited read-only components for admins.

1. AcroForm Automation (Government Forms)
1.1 Problem Being Solved
Government forms (I-9, W-4, etc.) require:
Exact checkbox placement
Specific hidden fields
Audit-proof integrity
Manual uploads or drag-and-drop PDFs are non-compliant and error-prone.

1.2 Solution: Wizard → PDF Mapping
Step 1: Web-Based Wizard
User completes a guided HTML form:
Marital status
SSN
Address
Employment details
No PDFs shown to the user at this stage
Step 2: Backend PDF Mapping
Use pdf-lib
Map wizard answers to:
Official government PDF AcroForm fields
Invisible text fields and checkboxes
No visual guesswork
Step 3: Form Locking & Signature Certificate
Flatten the completed PDF (text becomes non-editable)
Append a Signature Certificate Page containing:
Signer name
Date/time
IP address
Document hash
Agency identifier
Result:
✔ Government-accurate
✔ Tamper-resistant
✔ Audit-ready

2. Credential Tracking (“Expiration Watchdog”)
2.1 Credential Types
Tracked documents include:
Professional licenses
Liability insurance
TB tests
Any compliance-required credential
Stored in:
UserDocuments
user_id
document_type
expiration_date
is_blocking
file_url
uploaded_at

2.2 Automated Monitoring
A daily scheduled task scans all credentials.
Notification Timeline
30 days before expiration
Email + SMS reminder
14 days before expiration
Follow-up reminder
1 day before expiration
Final warning

2.3 Hard Compliance Enforcement
If a document is:
is_blocking = true
AND expiration_date < today
Then the system automatically:
Disables access to Office Scheduling
Prevents room booking
Optionally blocks other clinical actions
This integrates directly with:
Navigation rendering
Permission middleware

3. Digital W-2 Locker (Secure Storage)
Purpose
Provide staff with a read-only, secure archive for payroll documents.
Rules
Admin uploads PDFs only
No editing
No deletion by staff
No document generation (storage only)
UI
“Payroll Documents” section
Year-based folders
Download-only access

4. Audit & Legal Integrity
4.1 Immutable History
All document actions generate audit entries:
Uploaded
Generated
Replaced
Expired
Block triggered
4.2 Role-Based Visibility
Admins: full access
Staff: own documents only
No school or client access

5. System Integrations
Connected Modules
Employee Status Lifecycle
Documents unlock onboarding stages
Office Scheduling
Compliance gates booking access
Notifications
Uses Google Email API + Twilio SMS
Emergency Broadcasts
Can include document-related alerts if needed

6. User Experience Summary
Staff never touch PDFs directly
Compliance is automatic, not policed manually
Admins see a single dashboard instead of chasing files
Audits are defensible and complete
This replaces chaos with deterministic compliance.




Notification Preferences System
User-Controlled, Role-Aware, Safety-Preserved
Purpose
Give every user clear, granular control over how and when they receive notifications without breaking safety, compliance, or operational coverage.
This system must:
Respect work-life boundaries
Preserve critical alerts
Support multiple channels (In-App, Email, SMS)
Integrate with Quiet Hours, Support Safety Net, and Compliance

1. Where This Lives (UX Placement)
Account Settings → Notifications
Accessible to:
Employees
School Staff
Clients / Guardians (limited version)
Admins cannot override personal preferences except for emergency or compliance messages.

2. Notification Channels (Global Toggles)
Each user sees three master toggles:
2.1 In-App Notifications
✅ Always enabled by default
Cannot be fully disabled (safety + audit reasons)
Used for:
Internal alerts
Support Safety Net
Compliance notices

2.2 Email Notifications
Toggle: ON / OFF
Delivered via Google Email API
Used for:
Compliance reminders
Document expiration
Broadcast messages
Non-urgent system alerts

2.3 SMS Notifications
Toggle: ON / OFF
Delivered via Twilio
Used for:
Inbound client messages
Urgent alerts
After-hours notifications (if allowed)
⚠️ If SMS is OFF:
Messages still appear in-app
Support team still receives alerts
Auto-responders still fire (if enabled)

3. Notification Categories (Granular Controls)
Users can fine-tune what they’re notified about.
3.1 Messaging
☐ New inbound client text
☐ Support Safety Net alerts
☐ Replies to my messages
Note: Support Safety Net alerts cannot be fully disabled for support staff.

3.2 Scheduling
☐ Room booking approved/denied
☐ Schedule changes
☐ Room release requests (CPA/Admin only)

3.3 Compliance & Documents
☐ Credential expiration reminders
☐ Access restriction warnings
☐ Payroll document availability
⚠️ Blocking compliance notifications cannot be disabled.

3.4 Surveys & Kiosk (Providers)
☐ Client checked in
☐ Survey completed
☐ Longitudinal trend alerts (optional future)

3.5 System & Broadcasts
☐ Emergency broadcasts
☐ Organization-wide announcements
Emergency broadcasts always bypass preferences.

4. Quiet Hours Configuration (Per User)
4.1 Quiet Hours Toggle
☐ Enable Quiet Hours
If OFF:
Notifications follow normal delivery rules

4.2 Schedule Selector
Allowed Days (Mon–Sun)
Start Time
End Time
Example:
Monday–Friday, 9:00 AM – 5:00 PM

4.3 Delivery Rules
Inside Hours
SMS + Push + In-App (based on toggles)
Outside Hours
In-App only
No SMS or Push
Badge/Unread count increases

4.4 Exceptions
Quiet Hours are overridden if:
Message is marked URGENT
User has Emergency Override enabled
Notification type is:
Emergency Broadcast
Blocking Compliance Alert

5. After-Hours Auto-Responder Settings
Visible if:
SMS is enabled
User receives client messages
Settings:
☐ Enable Auto-Reply
Message Text (editable)
Preview shown
System behavior:
Sends auto-reply once per client every 4 hours
Still logs message
Still notifies support team

6. Support Safety Net (Non-Optional Layer)
For users flagged as:
is_support_staff = true
Rules:
Cannot disable:
Inbound message visibility
Red-dot alerts
Can control:
SMS vs In-App delivery
Always see:
“All Recent Texts” feed
This ensures:
✔ No client message is missed
✔ No dependence on a single clinician

7. Data Model (Backend)
UserPreferences Table
user_id
email_enabled
sms_enabled
in_app_enabled (always true)
quiet_hours_enabled
allowed_days[]
start_time
end_time
auto_reply_enabled
auto_reply_message
emergency_override

8. Notification Gatekeeper Logic (Single Source of Truth)
Every outbound notification passes through:
User Status (active?)
User Category (employee / school / client)
Role & Safety Rules
Notification Category
Quiet Hours Check
Channel Toggles
Emergency / Compliance Override
Only then is delivery attempted.

9. Default Presets (Important)
To avoid misconfiguration:
Employees (Default)
In-App: ON
Email: ON
SMS: ON
Quiet Hours: OFF
Providers
Messaging alerts: ON
Kiosk alerts: ON
Quiet Hours: OFF
Support Staff
Safety alerts: FORCED ON
SMS: Optional
In-App: ON
Clients / Guardians
SMS: ON
Email: Optional
No Quiet Hours (future optional)

10. Why This Works
Gives autonomy without sacrificing safety
Prevents notification fatigue
Preserves legal/compliance alerts
Centralizes logic (no spaghetti rules)
Scales cleanly with future features
This completes the notification story across your entire platform.





Settings Overhaul
your new "Super Modal" would look:
SETTINGS
GENERAL
🏢 Company Profile
👥 Team & Roles (New)
💳 Billing (New)
WORKFLOW
📦 Packages
📋 Checklist Items
📝 Field Definitions (User Info Fields)
THEMING
🎨 Branding & Templates
🖼️ Assets (Icons/Fonts)
SYSTEM
💬 Communications
🔌 Integrations (New)
🔐 Platform & Security
🗑️ Archive

