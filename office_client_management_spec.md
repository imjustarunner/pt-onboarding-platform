# Office Client Management

## Product Purpose, Structure, and Required Features

## 1. Purpose

**Office Client Management** is the operational workspace for managing clients who receive, or are seeking, **office-based mental health services**.

It must be intentionally separate from school-based client management because office clients have different intake, scheduling, guardian, portal, billing, insurance, provider-assignment, and follow-up workflows.

The module should let office staff immediately answer:

1. Who is new?
2. Who needs something from us?
3. Who are we waiting on?
4. Who is ready to schedule?
5. Who is already active?
6. What changed recently?
7. Which provider can take the client?
8. What is happening in the office today?

The system should reduce reliance on spreadsheets, inbox tracking, manual intake lists, and opening individual charts just to determine what needs attention.

---

# 2. Module Naming and Navigation

The overall module should be named:

# **Office Client Management**

Recommended structure:

```text
Office Client Management
├── Office Hub
├── Office Clients
├── Office Calendar
├── Office Providers
├── Intake / Submissions
└── Waitlist
```

The two primary views are:

## Office Hub
The operational command center.

It answers:

> **What is happening in the office right now, and what needs attention?**

## Office Clients
The client workflow and roster workspace.

It answers:

> **Who are our office clients, where are they in the process, and what needs to happen next?**

These pages should work together, not duplicate each other.

---

# 3. Office Hub

## Purpose

The **Office Hub** provides an at-a-glance operational picture of office services.

It should prioritize:

- Today's activity
- New incoming office clients
- Pending intake work
- Provider availability
- Scheduling
- Office room usage
- Waitlist activity
- Important alerts
- Administrative follow-up

It should not become a full client chart.

---

## 3.1 Top-Level Metrics

Recommended summary cards:

### Today's Appointments
Show the number of office appointments scheduled today.

Optional secondary counts:

- In-person
- Virtual
- Cancelled
- Unconfirmed

### New Office Intakes
Show new office submissions received today or within the selected period.

### Pending Review
Show office clients whose submission requires administrative or clinical review.

### Active Office Providers
Show providers currently participating in office services.

Optional breakdown:

- In office
- Virtual
- Out
- Accepting new clients

### Office Waitlist
Show the number of prospective office clients currently waiting.

---

# 4. Office Calendar

The calendar should be one of the most prominent components of the Office Hub.

It should display:

- Client
- Provider
- Appointment time
- Duration
- Service type
- In-person versus virtual
- Assigned room
- Group appointments when applicable
- Provider blocked time
- Office closures
- Room conflicts

Recommended filters:

- Today
- Day
- Week
- Provider
- Room
- Service type
- In-person
- Virtual

Color coding can distinguish rooms and appointment types, but the system should also use labels or icons so color is not the only indicator.

---

# 5. Office Providers

The Hub should contain a compact Office Providers panel.

Each provider should show:

- Provider name
- Credentials
- Profile image or initials
- Current status
- In office / virtual / unavailable
- Assigned room when applicable
- Today's caseload
- Next opening
- Whether accepting new clients
- Office service availability

Recommended statuses:

- In Office
- Virtual
- Available
- Fully Booked
- Out Today
- Not Accepting New Clients

Quick actions may include:

- View schedule
- View openings
- Assign client
- View provider
- Update availability

---

# 6. New Office Clients Queue

This should be one of the most visible parts of the system.

Recommended title:

# **New Office Clients**

or

# **New Office Clients Queue**

The purpose is to prevent newly submitted office clients from disappearing inside a general client list.

Each entry should show:

- Client name
- Age or DOB
- Guardian when applicable
- Date/time submitted
- Intake type
- Current intake status
- Insurance/self-pay status
- Provider-assignment status
- Important missing requirement
- Next required action

Example:

```text
Emma Carter
Guardian: Lisa Carter
Submitted: 1 hour ago
Status: Ready for Review
Next Step: Assign Provider
[Review]
```

Useful indicators:

- New Today
- Unreviewed
- Ready for Review
- Needs Information
- Insurance Pending
- Ready for Assignment
- Ready to Schedule

---

# 7. Pending Actions

The Office Hub should summarize outstanding work by category.

Recommended categories:

- Incomplete enrollment forms
- Missing documents
- Missing insurance information
- Insurance verification pending
- Guardian signature needed
- Client signature needed
- Portal invitation pending
- Portal account not activated
- Intake requires review
- Clinical review required
- Provider assignment needed
- Client ready to schedule
- Scheduling follow-up needed
- Waitlist review needed
- Payment setup incomplete

Example:

```text
Pending Actions

Incomplete Forms                 7
Missing Documents                8
Insurance Verification           5
Guardian Signature Needed        3
Provider Assignment Needed       4
Ready to Schedule                6
```

Every count should be clickable and open the corresponding filtered list.

---

# 8. Quick Actions

Recommended Office Hub quick actions:

- Add Office Client
- Start New Intake
- Review Intake
- Assign Provider
- Schedule Client
- View Waitlist
- Send Portal Invite
- Verify Insurance
- Upload Document
- Create Client Task

---

# 9. Office Alerts

A small operational alert panel may show:

- Provider called out
- Room unavailable
- Insurance verification issue
- Appointment requiring action
- Expiring authorization
- Intake backlog
- Unassigned clients
- Payment issue affecting scheduling
- Office system notice

Alerts should be limited to information that staff may need to act on.

---

# 10. Office Clients Page

## Purpose

The **Office Clients** page is the primary client-management workspace for all prospective and continuing office clients.

It should allow staff to understand the client's administrative position **without opening the entire client chart**.

The page should focus on:

- Prospective clients
- Continuing clients
- Guardians
- Portal access
- New documents
- Information changes
- Outstanding tasks
- Intake progress
- Scheduling readiness
- Provider assignment

---

# 11. Client Categories

## Prospective Office Clients

A prospective client has entered the office enrollment process but has not fully transitioned into ongoing care.

Examples:

- Initial interest submitted
- Enrollment packet started
- Enrollment packet submitted
- Insurance under review
- Awaiting provider assignment
- Ready to schedule
- Waitlisted

## Continuing Office Clients

A continuing client is already established with the organization.

Examples:

- Active
- Scheduled
- Temporarily inactive
- On hold
- Needs renewal/update
- Awaiting next appointment
- Pending closure

---

# 12. Office Client Filters

Recommended filters:

- All Office Clients
- Prospective
- Continuing
- New
- Needs Action
- Ready for Review
- Ready for Assignment
- Ready to Schedule
- Provider Unassigned
- Portal Pending
- Documents Updated
- Insurance Pending
- Missing Documents
- Waitlisted
- On Hold

Advanced filters may include:

- Provider
- Service
- Age
- Guardian status
- Insurance payer
- Self-pay
- Intake date
- Last appointment
- Next appointment

---

# 13. Prospective Clients Table

Recommended columns:

| Field | Purpose |
|---|---|
| Client | Identifies the prospective client |
| Guardian(s) | Shows affiliated guardian relationships |
| Intake Type | Adult, minor, couple, family, etc. |
| Portal Access | Shows portal readiness |
| Documents | Shows new or missing documents |
| Insurance / Payment | Shows financial readiness |
| Provider | Shows assignment status |
| Status | Shows current workflow state |
| Next Step | Tells staff exactly what should happen next |
| Submitted | Shows how long the client has been waiting |

Example:

```text
Emma Carter | Lisa Carter (Mother) | Minor Intake | Active Portal |
2 New Documents | Insurance Verified | Unassigned |
Ready for Review | Assign Provider | 1h ago
```

---

# 14. Guardians and Client Relationships

For minor clients, guardian relationships should be visible from the main client-management page.

Recommended fields:

- Guardian name
- Relationship
- Legal authority status when applicable
- Primary guardian
- Secondary guardian
- Portal access
- Contact permission
- Financial responsibility when applicable
- Signature requirements
- Whether guardian information is incomplete

Possible relationship labels:

- Mother
- Father
- Parent
- Legal Guardian
- Foster Parent
- Grandparent
- Other Authorized Representative

For an adult client, display:

```text
Self
```

or:

```text
No guardian required
```

---

# 15. Portal Access

Portal access should be visible without opening the client's full profile.

Recommended statuses:

- Active
- Invite Sent
- Not Invited
- Pending Activation
- Locked
- Declined
- Access Removed

For minors with multiple guardians, portal access should be tracked **per guardian**, not only per client.

Example:

```text
Lucas Thompson

Mark Thompson — Portal Active
Tanya Thompson — Invite Sent
```

Recommended actions:

- Send invitation
- Resend invitation
- Copy activation link
- Disable access
- Review guardian access
- View last login

---

# 16. Documents and Information Updates

The Office Clients page should contain a recent updates feed.

Examples:

- Insurance card uploaded
- Driver's license uploaded
- Consent signed
- ROI submitted
- Guardian signature completed
- Address changed
- Phone number changed
- Email changed
- Emergency contact updated
- Demographics updated
- New clinical document received

Each update should show:

- Client
- Type of update
- Who submitted it
- Date/time
- Whether review is required
- Whether staff has acknowledged it

Example:

```text
Updated Insurance Card
Mia Wilson
Submitted by: Jordan Wilson (Guardian)
20 minutes ago
[Review]
```

---

# 17. Client Tasks and To-Dos

Tasks should be attachable directly to office clients.

Examples:

- Call guardian
- Verify insurance
- Review document
- Send portal invitation
- Verify demographics
- Assign provider
- Schedule intake
- Follow up on waitlist
- Obtain signature
- Request insurance card
- Send payment link
- Review clinical intake
- Contact client after no response

Each task should support:

- Client
- Task
- Assigned staff member
- Due date
- Priority
- Status
- Created by
- Notes
- Completion date

Recommended priorities:

- High
- Medium
- Low

Recommended statuses:

- Open
- In Progress
- Waiting on Client
- Waiting on Guardian
- Waiting on Insurance
- Waiting on Provider
- Completed

---

# 18. Continuing Clients

The continuing-client section should show established office clients separately from prospective clients.

Recommended information:

- Client
- Assigned provider
- Last appointment
- Next appointment
- Current service
- Status
- Outstanding administrative item
- Portal status
- Billing/payment alert when appropriate

Example:

```text
Olivia Brown
Provider: Dr. Patel
Next Appointment: Thu 2:00 PM
Outstanding: Annual Disclosure Due
Status: Active
```

Possible outstanding items:

- Annual paperwork
- Updated consent
- Treatment plan review
- Insurance change
- Payment method issue
- Authorization expiring
- Unread message
- Missing guardian signature
- Updated demographics required

---

# 19. Office Client Status Model

A recommended intake lifecycle:

```text
New Submission
      ↓
Packet Started
      ↓
Packet Submitted
      ↓
Administrative Review
      ↓
Insurance / Payment Review
      ↓
Clinical Review, if required
      ↓
Ready for Assignment
      ↓
Provider Assigned
      ↓
Ready to Schedule
      ↓
Scheduled
      ↓
Active / Continuing
```

Alternate paths may include:

```text
→ Waitlisted
→ Needs Information
→ Unable to Contact
→ Declined
→ Referred Out
→ Closed Before Intake
```

The system must maintain two separate concepts:

## Current Status
Where the client is now.

## Next Required Step
What needs to happen next.

Example:

```text
Status: Insurance Review
Next Step: Verify uploaded insurance card
```

These should not be the same field.

---

# 20. Waitlist

Each office waitlist entry should show:

- Client
- Guardian
- Requested service
- Provider preference
- Availability
- Insurance/payment type
- Waitlist reason
- Date added
- Priority when applicable
- Last contact
- Next follow-up date

Potential waitlist reasons:

- No provider availability
- Requested specialty unavailable
- Insurance issue
- Requested schedule unavailable
- Awaiting documentation
- Clinical review
- Other

---

# 21. Search

Search should support:

- Client name
- Client ID
- Guardian name
- Email
- Phone
- Provider
- Document name
- Task
- Insurance payer

Search results should identify whether the person is:

- Prospective
- Continuing
- Waitlisted
- Closed

---

# 22. Client Quick View

Clicking a client from a dashboard list should be able to open a right-side quick-view drawer instead of always opening the full chart.

Example:

```text
CLIENT
Emma Carter
Age 12

STATUS
Ready for Review

GUARDIAN
Lisa Carter — Mother
Portal Active

INSURANCE
Blue Cross
Verification Complete

PROVIDER
Not Assigned

DOCUMENTS
2 New
0 Missing

NEXT STEP
Assign Provider

[Open Full Client]
[Assign Provider]
[Create Task]
```

---

# 23. Full Office Client Profile

The full client profile may remain part of the broader client-record system.

Recommended sections:

- Overview
- Guardians / Relationships
- Contact Information
- Enrollment
- Documents
- Insurance & Billing
- Appointments
- Provider
- Portal Access
- Tasks
- Messages
- Clinical Records
- Activity History

Office Client Management should summarize this information rather than duplicate the entire chart.

---

# 24. Activity History

Important administrative changes should create an activity record.

Examples:

- Intake submitted
- Guardian added
- Portal invitation sent
- Portal activated
- Insurance card uploaded
- Insurance verified
- Provider assigned
- Provider changed
- Appointment scheduled
- Client waitlisted
- Document requested
- Document received
- Task completed

Example:

```text
2:14 PM
Insurance verified by Amanda W.

1:42 PM
Guardian Lisa Carter uploaded insurance card.

11:03 AM
Enrollment packet submitted.
```

---

# 25. Notifications

Useful actionable notifications include:

- New office intake submitted
- Document uploaded
- Signature received
- Portal activation completed
- Insurance verification failed
- Client ready for provider assignment
- Client ready to schedule
- Client waiting beyond a threshold
- Provider assignment changed
- Client task overdue

Users should be able to control which notifications they receive.

---

# 26. Roles and Permissions

Possible roles:

## Office Administrator
Can manage intake, scheduling, portal, documents, guardians, tasks, providers, and office workflows.

## Intake / Enrollment Staff
Can manage submissions, documentation, insurance information, guardians, portal access, and intake workflow.

## Clinical Administrator
Can review clinical intake information, approve assignment, and manage clinical routing.

## Provider
Can see assigned clients and necessary intake information but should not automatically receive broad office-administration access.

## Billing Staff
Can access insurance, payment readiness, and billing-related information.

Permissions should control both:

- What information is visible
- What actions the user may perform

---

# 27. UX Principles

## Action Before Information

Instead of:

```text
Insurance: Pending
```

Prefer:

```text
Insurance Review
Verify uploaded insurance card
[Review]
```

## Do Not Make Staff Open Every Chart

Expose enough information for routine workflows directly from Office Hub or Office Clients.

## Make New Clients Obvious

Clearly display:

- New today
- New since last review
- Unreviewed
- Ready for review

## Separate Status From Task

Example:

```text
Status: Provider Assigned
Task: Call family to schedule
```

## Show Who the System Is Waiting On

Useful labels:

- Waiting on Client
- Waiting on Guardian
- Waiting on Insurance
- Waiting on Provider
- Waiting on Clinical Review
- Waiting on Staff

## Make Counts Actionable

Example:

```text
Missing Documents        8
Portal Invites Pending   11
Ready to Schedule         6
Provider Unassigned       4
```

Each count should open the relevant filtered workflow.

---

# 28. Recommended Visual Hierarchy

## Office Hub

```text
Office Client Management
└── Office Hub

[Today's Appointments]
[New Office Intakes]
[Pending Review]
[Active Providers]
[Office Waitlist]

---------------------------------------------------

OFFICE CALENDAR                    OFFICE PROVIDERS

---------------------------------------------------

NEW OFFICE CLIENTS                 PENDING ACTIONS

---------------------------------------------------

QUICK ACTIONS       ALERTS         FOLLOW-UPS
```

## Office Clients

```text
Office Client Management
└── Office Clients

[New Office Intakes]
[Prospective]
[Continuing]
[Needs Follow-Up]
[Portal Pending]

FILTERS / SEARCH

---------------------------------------------------

PROSPECTIVE OFFICE CLIENTS         NEW OFFICE CLIENTS

---------------------------------------------------

CONTINUING     DOCUMENT UPDATES    CLIENT TASKS

---------------------------------------------------

GUARDIAN / PORTAL SNAPSHOT
```

---

# 29. Recommended Dashboard Counts

Useful counts include:

- New today
- Prospective
- Continuing
- Ready for review
- Ready for assignment
- Provider unassigned
- Ready to schedule
- Insurance pending
- Missing documents
- Portal pending
- Guardian signature pending
- Client signature pending
- Needs staff follow-up
- Waiting on client
- Waiting on guardian
- Waitlisted
- On hold

---

# 30. Integrations

Office Client Management should connect to existing system functions instead of becoming a duplicate database.

## Enrollment
New office enrollment submissions automatically appear in the New Office Clients queue.

## Client Profile
Changes made from Office Client Management update the primary client record.

## Guardians
Guardian relationships and access permissions remain synchronized.

## Portal
Invitations, activation, forms, messages, and uploads are reflected immediately.

## Documents
New documents appear in the recent updates feed.

## Insurance & Billing
Verification and payment readiness affect intake workflow.

## Provider Management
Provider availability and capacity support assignment decisions.

## Scheduling
Clients marked Ready to Schedule can be scheduled directly.

## Messaging
Staff can contact the appropriate client or guardian from the workflow when permitted.

## Tasks
Client-related tasks appear both on Office Clients and in the assigned employee's task system.

---

# 31. What Should Not Live on the Main Hub

Do not overload the Office Hub with:

- Full psychotherapy notes
- Full diagnostic history
- Full treatment plans
- Complete billing ledgers
- Every document
- Every historical appointment
- Full guardian records
- Full clinical assessments

Those belong in the full client record.

The Office Hub and Office Clients views should primarily show:

> **Status, readiness, changes, relationships, and required actions.**

---

# 32. MVP Requirements

## Office Hub MVP

- Office calendar
- New Office Clients queue
- Pending intake/actions
- Provider availability
- Today's appointment count
- Prospective-client count
- Waitlist count
- Quick actions
- Click-through filters

## Office Clients MVP

- Prospective clients
- Continuing clients
- Guardian relationships
- Portal access status
- Document status
- Insurance/payment readiness
- Provider assignment
- Intake status
- Next required step
- New documents and information updates
- Client tasks
- Search and filters
- New Office Client indicator

---

# 33. Future Enhancements

Potential future enhancements:

- Automatic provider matching
- AI-assisted intake summarization
- AI-generated next-step recommendations
- Automatic stalled-intake detection
- Smart reminders
- Estimated time to scheduling
- Provider capacity forecasting
- Office room utilization analytics
- Intake conversion reporting
- Referral-source analytics
- Waitlist aging
- Automated outreach
- Duplicate-client detection
- Missing-document detection
- Guardian relationship validation
- Suggested insurance follow-up
- Client readiness scoring

Example:

```text
Mia Wilson
92% Intake Complete

Recommended Next Step:
Review insurance card uploaded 23 minutes ago.

After verification:
Client can move to Ready for Assignment.
```

---

# 34. Core Product Rule

> **Office Client Management should tell staff what is happening with every office client and what needs to happen next, without requiring them to search through individual charts.**

The **Office Hub** provides the operational overview.

The **Office Clients** page provides the client workflow and roster.

Together, they create one workspace for managing the full office-client lifecycle from first submission through continuing care.
