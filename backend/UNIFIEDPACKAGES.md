# Unified Package Architecture for Consulting, Coaching, and Tutoring

## Purpose

The application should **not build separate package systems for consulting, coaching, and tutoring**.

Instead, it should have one reusable **Package Engine** with a common set of rules for:

* pricing;
* payment;
* scheduling;
* cancellations;
* rescheduling;
* no-shows;
* package expiration;
* refunds;
* payment plans;
* recurring billing;
* service usage;
* credits;
* provider assignment;
* package changes;
* customer agreements;
* administrative overrides; and
* reporting.

Then each service category should be able to turn on additional features that make sense for that field.

The core concept should be:

> **One Package Engine. Different fulfillment models.**

A tutoring package might consume **sessions**.

A coaching package might consume **sessions over a defined coaching engagement**.

A consulting package might consume **hours, meetings, deliverables, milestones, reserved capacity, or some combination of those items**.

The financial and policy engine underneath them can remain substantially the same.

---

# 1. Critical Architecture Decision: A Package Is More Than a Price

Do not define a package in the database as:

> Name + Price + Number of Sessions

That will become limiting almost immediately.

A package should instead be an **offer containing entitlements, financial rules, scheduling rules, usage rules, and policies**.

Conceptually:

```text
PACKAGE
├── Identity
├── Service Category
├── What Is Included
├── Entitlements / Credits
├── Pricing
├── Payment Options
├── Scheduling Rules
├── Cancellation Rules
├── Rescheduling Rules
├── Expiration Rules
├── Refund / Termination Rules
├── Included Support
├── Add-Ons / Overage
├── Provider Rules
├── Client Eligibility
├── Outcomes / Goals
├── Agreement / Terms
└── Domain-Specific Configuration
```

This is important because:

* two $500 packages may have completely different cancellation rules;
* the same package may cost $1,000 upfront or $1,100 using installments;
* one package may allow rescheduling while another does not;
* consulting may include deliverables that are unrelated to appointments;
* tutoring may include eight session credits;
* coaching may include six sessions plus between-session messaging;
* packages may expire differently;
* package policies may change over time; and
* existing clients should generally remain attached to the package terms they purchased.

---

# 2. Separate Six Concepts in the Application

The application should treat these as separate concepts.

## 2.1 Service

What is actually being provided.

Examples:

* Math Tutoring
* SAT Preparation
* Executive Function Tutoring
* Executive Coaching
* Business Coaching
* Leadership Coaching
* Operations Consulting
* Strategic Consulting
* Process Development Consulting

---

## 2.2 Package

The commercial offer.

Examples:

* Math Momentum
* SAT Intensive
* Leadership Accelerator
* Executive Evolution
* Business Systems Sprint
* Fractional Operations Advisory

---

## 2.3 Entitlement

What purchasing the package gives the customer.

Examples:

* 4 × 60-minute sessions
* 10 tutoring hours
* 6 coaching sessions
* 2 strategy meetings per month
* 5 consulting hours per month
* unlimited portal messaging
* one assessment
* one written report
* one process map
* one implementation plan
* priority scheduling

An entitlement should be independently trackable.

---

## 2.4 Billing Plan

How the customer pays.

For example, the exact same coaching package could allow:

**Pay in Full**

$1,800 once.

**Payment Plan**

3 payments of $625.

Total: $1,875.

The application should therefore not assume:

> package price = payment amount.

Instead:

```text
Package
    ↓
Billing Options
    ├── Pay in Full
    ├── Installments
    ├── Monthly Subscription
    └── Custom Invoice
```

---

## 2.5 Policy Set

The rules attached to the package.

Examples:

* 24-hour cancellation policy;
* 48-hour cancellation policy;
* no cancellations;
* one courtesy late cancellation;
* session forfeited after a late cancellation;
* 50% late cancellation fee;
* no-show charged 100%;
* session credits expire after 90 days;
* unused credits roll over;
* one package pause permitted.

---

## 2.6 Enrollment / Purchase

The actual customer's instance of the package.

This distinction is extremely important.

For example:

**Package Template**

`Leadership Accelerator — Version 3`

Then:

**John Smith's Purchase**

* purchased August 12;
* 6 sessions remaining;
* one courtesy reschedule remaining;
* payment 2 of 3 due;
* expires December 12;
* assigned to Coach A.

Never modify John's historical agreement simply because an administrator later edits the Leadership Accelerator package.

---

# 3. Package Versioning

Every published change should create a new **Package Version**.

Example:

```text
Leadership Accelerator

Version 1
Jan 1 – Mar 31
$1,500
24-hour cancellation

Version 2
Apr 1 – Aug 31
$1,650
24-hour cancellation
1 courtesy late reschedule

Version 3
Sep 1 onward
$1,750
48-hour cancellation
```

Existing purchasers remain attached to the version they accepted unless an authorized amendment occurs.

This protects:

* billing history;
* client expectations;
* reporting;
* contracts;
* refunds;
* disputes; and
* auditability.

---

# 4. Universal Package Types

The application should have a **Package Type** field that applies across consulting, coaching, and tutoring.

## 4.1 Pay As You Go

Customer purchases individual services.

Example:

> $85 tutoring session

or

> $250 coaching session

or

> $300 consulting hour.

Typical characteristics:

* no long-term commitment;
* individual appointments;
* standard cancellation/no-show fee;
* payment at booking or after service;
* no expiration because there is no prepaid bank.

---

## 4.2 Prepaid Bundle

Customer purchases several units in advance.

Example:

> 8 tutoring sessions for $560.

Could have:

* upfront discount;
* expiration date;
* credit balance;
* rescheduling privileges;
* reduced per-session price.

---

## 4.3 Subscription

Customer pays recurring fees for recurring entitlements.

Example:

> $450/month
> Includes four tutoring sessions each month.

or

> $1,500/month
> Includes two executive coaching sessions and between-session messaging.

The application must define:

* billing date;
* included units;
* rollover;
* pause rules;
* cancellation notice;
* minimum commitment;
* renewal rules.

---

## 4.4 Commitment With Installments

The customer commits to the entire package but pays over time.

This is **different from a cancel-anytime subscription**.

Example:

> 12 coaching sessions: $3,000
> Pay $3,000 upfront or four monthly payments of $800.

The installment plan does not necessarily mean they are purchasing one month at a time.

The customer purchased the **entire $3,200 installment package**.

---

## 4.5 Retainer

Especially important for consulting.

The client pays to reserve:

* capacity;
* expertise;
* access;
* hours;
* meetings; or
* priority.

Consulting retainers commonly define specific monthly scope, capacity, deliverables, check-ins, payment timing, communication expectations, out-of-scope work, and termination procedures. Monthly payment in advance and notice provisions such as 30 days are common structures.

Example:

> $2,500/month
> 2 strategy meetings
> up to 8 consulting hours
> priority email support
> 3-month minimum

---

## 4.6 Fixed Project

Primarily consulting.

Example:

> Operations Redesign — $12,000

Includes:

* discovery;
* process analysis;
* workflow design;
* documentation;
* implementation roadmap.

The customer isn't buying twelve $1,000 meetings.

They are buying an **outcome and defined scope**.

---

## 4.7 Milestone Package

Payment is attached to stages.

Example:

```text
$15,000 engagement

40% — Project initiation
30% — Delivery of workflow redesign
20% — Implementation
10% — Final acceptance
```

---

## 4.8 Hybrid

Allow packages to combine models.

Example:

> $3,000 Consulting Implementation Package
>
> Includes:
>
> * discovery assessment;
> * implementation plan;
> * 10 consulting hours;
> * 3 strategy meetings;
> * 30 days of messaging support.

This flexibility will become especially important for consulting.

---

# 5. Universal Package Builder

Administrators should create packages through essentially the same builder regardless of service category.

---

## STEP 1 — Basic Information

### Fields

* Package Name
* Internal Name
* Service Category

  * Consulting
  * Coaching
  * Tutoring
* Service
* Package Type
* Short Description
* Full Description
* Active / Inactive
* Public / Private
* Featured
* Available Beginning
* Available Until
* Location eligibility

  * Virtual
  * In person
  * Either
* Individual / Group
* Maximum Participants
* Age restrictions
* Customer type

  * Individual
  * Parent/Guardian
  * Business
  * Organization
  * School
* Tags

---

# 6. STEP 2 — What Is Included?

This should use an **Entitlement Builder**.

An entitlement could be:

| Entitlement       | Example                        |
| ----------------- | ------------------------------ |
| Session           | 6 coaching sessions            |
| Minutes           | 60-minute sessions             |
| Hours             | 10 consulting hours            |
| Assessment        | 1 academic assessment          |
| Deliverable       | 1 process manual               |
| Meeting           | 2 strategy meetings            |
| Support Access    | Email support                  |
| Message Allowance | 5 support requests             |
| Review            | Resume/business/process review |
| Report            | Student progress report        |
| Resource          | Digital workbook               |
| Priority          | Priority scheduling            |
| Milestone         | Implementation phase           |
| Event             | Workshop                       |
| Other             | Custom entitlement             |

Each entitlement should contain:

* quantity;
* unit;
* duration if applicable;
* whether it is required;
* whether it is individually tracked;
* whether it can be replenished;
* whether it expires;
* whether it can be purchased separately;
* overage price;
* display description.

---

# 7. STEP 3 — Pricing

Every package should have a **Base Retail Value** and one or more **Purchase Options**.

Example:

## Package

Leadership Accelerator

Base Value:

**$2,000**

### Purchase Options

#### Pay in Full

$1,800

Savings: $200

#### 3-Month Payment Plan

3 × $650

Total Contract Price: $1,950

#### Employer Sponsored

$2,000 invoice

Net 15

This lets the app show:

> Save $150 by paying in full.

without changing the actual package.

Public coaching offerings demonstrate this model in practice. For example, one current executive/life coaching offering advertises a six-session/three-month program as three $350 payments, while offering a $997.50 pay-in-full price—a discount from the installment total.

---

# 8. Payment Settings

Every billing option should support:

### Payment Timing

* At booking
* Before first session
* Upon enrollment
* Monthly
* Weekly
* Milestone
* After service
* Custom invoice

### Payment Method

* Card
* ACH
* Invoice
* Cash
* Check
* External payment
* Other

### Required Deposit

Example:

```text
Deposit: $500
Applied toward total: Yes
Refundable: No
```

### Automatic Payments

* Required
* Optional
* Disabled

### Failed Payment Rules

Configure:

* grace period;
* retry schedule;
* notification;
* suspend future booking;
* cancel appointments;
* disable package usage;
* administrative review.

### Late Payment

Could:

* issue warning;
* charge authorized fee;
* suspend package;
* prevent new appointments;
* require administrator action.

---

# 9. Payment Plans Should Be First-Class Objects

Do not simply split a price into installments.

A payment option should contain:

```text
Billing Option
├── Total Contract Price
├── Initial Payment
├── Number of Installments
├── Installment Amount
├── Frequency
├── First Payment Date
├── Autopay Required
├── Grace Period
├── Failed Payment Action
└── Early Payoff Allowed
```

Example:

```text
Tutoring Accelerator

Retail Price: $800

OPTION A
Pay in full: $720

OPTION B
2 payments of $390
Total: $780

OPTION C
4 payments of $200
Total: $800
```

The application should show the total cost clearly for each payment option.

---

# 10. Cancellation Must Have TWO Different Meanings

This distinction will save considerable development problems.

## Appointment Cancellation

> "I cannot attend Tuesday's tutoring session."

versus:

## Package Termination

> "I want to stop my six-month coaching program."

They are entirely separate policies.

The system should never have one generic:

`Cancellation Allowed = True/False`

field.

---

# 11. Appointment Cancellation Engine

Every package should have:

### Client Can Cancel Appointment

* Yes
* No
* Contact us only

However, even where cancellations are "not allowed," the application should generally let someone **report that they will not attend**.

The policy determines the consequence.

It is much better to record:

> Client cancelled — session forfeited

than prevent the person from communicating the cancellation.

---

# 12. Cancellation Notice Window

Configurable:

```text
No minimum
2 hours
4 hours
12 hours
24 hours
48 hours
72 hours
Custom
```

Tutoring providers commonly use 24-hour notice periods. Current public tutoring policies demonstrate a common structure where timely cancellations restore the session credit while cancellations inside the notice window cause the prepaid credit to be forfeited or a pay-as-you-go session to remain fully charged.

Coaching can be somewhat stricter. Chicago Booth's current executive coaching packages allow rescheduling with at least 48 business hours' notice, while shorter notice generally causes the session to count as completed.

---

# 13. Timely Cancellation Consequence

If cancelled outside the late-cancellation window:

Administrator chooses:

* Return session credit
* Create reschedule credit
* Refund payment
* Do not refund
* Do not restore session
* Allow rescheduling only
* Convert to account credit
* Custom

---

# 14. Late Cancellation Consequence

Separate setting.

Options:

* No penalty
* Lose session
* Charge full session price
* Charge percentage
* Charge flat fee
* Use one courtesy cancellation
* Create administrative review
* Allow reschedule but charge fee
* Custom

Example:

```text
Late Cancellation:
<24 hours

Action:
Consume 1 session credit

If PAYG:
Charge 100%

Courtesy Exceptions:
1 per package
```

---

# 15. No-Show Policy

This should NOT automatically be identical to late cancellation.

Configure separately.

Possible actions:

* consume session;
* 50% fee;
* 100% fee;
* flat fee;
* warning;
* lose recurring appointment;
* administrative review;
* require prepayment for future services.

Tutoring policies frequently treat no-shows more strictly than advance cancellations.

---

# 16. Courtesy Cancellation / Reschedule Bank

This is worth building directly into the platform.

Example:

> Includes 1 complimentary late reschedule.

Fields:

```text
Courtesy Events Allowed: 1

Applies To:
☑ Late Cancellation
☑ Illness
☐ No Show

Refresh:
○ Never
○ Each billing cycle
○ Each calendar year
○ Package renewal

Approval:
○ Automatic
○ Staff approval
```

This lets you offer premium packages greater flexibility without manually overriding policies.

Chicago Booth currently uses a similar concept by allowing exceptional consideration of one late reschedule per coaching package.

---

# 17. Rescheduling Rules

Rescheduling should be different from cancellation.

Configure:

### Is Rescheduling Allowed?

* Yes
* No
* Staff approval

### Required Notice

Example: 24 hours.

### Number of Free Reschedules

* Unlimited
* 1 per package
* 1 per month
* 2 per package
* Custom

### Reschedule Deadline

Must be completed:

* within 7 days;
* within 30 days;
* before end of billing cycle;
* before package expiration;
* custom.

### Same Provider Required?

* Yes
* No
* Prefer same provider

### Rescheduling Can Extend Package Expiration?

* Yes
* No
* Staff approval

---

# 18. Provider-Initiated Cancellation

This must be treated separately from client cancellations.

Recommended default:

```text
Provider Cancellation:
Session is NOT consumed.

Client receives:
✓ Original credit restored
✓ Free reschedule
✓ Expiration extended if necessary
```

Potential package option:

> Provider cancellation automatically creates a 14-day extension.

For coaching, Chicago Booth's current policy similarly provides that coach-initiated cancellations are rescheduled without penalty to the participant.

---

# 19. Exception Engine

Administrators should be able to define reasons that can override normal rules.

Examples:

* illness;
* medical emergency;
* family emergency;
* severe weather;
* school closure;
* provider cancellation;
* technical failure;
* bereavement;
* military obligation;
* administrative error.

Each exception should be:

```text
Automatic
Staff Approval
Documentation Required
No Exception
```

Every override should create an audit entry.

---

# 20. Package Expiration

Every prepaid package should explicitly answer:

> When must the purchased benefits be used?

Possible expiration methods:

* Never
* X days after purchase
* X days after first appointment
* End of calendar month
* End of billing cycle
* End of semester
* Specific date
* X months
* Custom

Example:

```text
6 Coaching Sessions
Expires 120 days after first session.
```

Chicago Booth currently uses different completion windows based on coaching package size: its one-session package must be completed within three months, four-session package within six months, and eight-session package within nine months.

---

# 21. Rollover

Configure:

### Can Unused Entitlements Roll Over?

* No
* Yes, unlimited
* Maximum quantity
* Maximum time
* Staff approval

Example:

```text
Monthly tutoring subscription:
4 sessions/month

Rollover:
Maximum 1 session

Rollover expires:
30 days later
```

Do not automatically permit unlimited rollover.

Otherwise a family can accumulate:

> 18 unused tutoring sessions

that the organization must somehow deliver later.

---

# 22. Package Pause / Freeze

Useful particularly for:

* tutoring vacations;
* school breaks;
* coaching leave;
* consulting client delays.

Configure:

```text
Pause Allowed: Yes

Maximum Pauses: 2

Maximum Pause Duration: 30 days

Package Expiration Extends: Yes

Billing Pauses: Yes

Reserved Appointment Held: No
```

---

# 23. Package Termination

Separate from appointment cancellation.

Fields:

### Can Customer End Package?

* Anytime
* After minimum term
* With notice
* No cancellation after commencement
* Staff approval
* Custom

### Required Notice

* Immediate
* 7 days
* 14 days
* 30 days
* Custom

### Financial Consequence

* No future charges
* Remaining balance immediately due
* Refund unused portion
* Refund minus fee
* Convert used sessions to standard price and refund balance
* No refund
* Prorated refund
* Account credit
* Custom

### Entitlements After Cancellation

* Immediately expire
* Remain through paid period
* Remain through expiration
* Custom

Consulting retainers frequently use notice provisions such as 30 days because capacity has been reserved for the client.

For coaching, the agreement should clearly explain termination and refund policies. ICF professional standards emphasize establishing the financial arrangements and other engagement expectations before coaching begins, while recognizing the client's right to terminate the coaching relationship subject to the agreed terms.

---

# 24. Refund Rules

Refund configuration should include:

```text
Before Service Begins
After First Service
Unused Entitlements
Partial Package Use
Provider Cancellation
Organization Cancellation
Package Expiration
Duplicate Payment
Administrative Exception
```

Options:

* Full refund
* Partial refund
* No refund
* Account credit
* Prorated
* Staff review

---

# 25. Package Credit Ledger

Do not simply store:

`Sessions Remaining = 4`

Build an actual ledger.

Example:

```text
PURCHASE                    +8
Session 8/12                -1
Timely Cancellation 8/19   +1
Session 8/26                -1
Late Cancellation 9/2      -1
Admin Courtesy Credit      +1
--------------------------------
BALANCE                      6
```

Every change should contain:

* timestamp;
* client;
* package;
* entitlement;
* amount;
* reason;
* booking;
* employee/system actor;
* policy used;
* notes.

This will be essential for disputes.

---

# 26. Package Statuses

Recommended:

```text
Draft
Published
Available
Purchased
Pending Start
Active
Paused
Payment Past Due
Suspended
Nearly Complete
Completed
Expired
Cancelled
Refunded
Terminated
Archived
```

---

# 27. Universal Scheduling Settings

Every package should specify:

### Booking

* Client may self-book
* Staff books
* Provider books
* Recurring schedule
* Requires approval

### Booking Horizon

Example:

> May schedule up to 45 days ahead.

### Minimum Booking Notice

Example:

> Appointment must be scheduled at least 12 hours in advance.

### Frequency

* Unlimited
* Once weekly
* Twice weekly
* Biweekly
* Monthly
* Maximum X per week
* Custom

### Recurring Slot

* Allowed
* Required
* Not available

### Provider

* Same provider required
* Any eligible provider
* Preferred provider
* Provider team

### Location

* In person
* Virtual
* Customer location
* School
* Business
* Hybrid

---

# 28. Included Communication / Access

This is particularly valuable for differentiating package tiers.

Options:

```text
Portal messaging
Email
SMS
Voice notes
Phone
Slack
Scheduled check-ins
Document review
Office hours
```

Define:

* included/not included;
* number;
* expected response time;
* business hours;
* overage policy.

Example:

### Basic Coaching

No between-session support.

### Premium Coaching

Portal messaging included.

Response within 2 business days.

Chicago Booth similarly identifies email or voice-note support as something that may be included in higher coaching offerings while establishing expected response boundaries.

---

# 29. Add-Ons

Package builder should allow:

> Add Optional Add-On

Examples:

### Tutoring

* additional tutoring hour;
* academic assessment;
* parent consultation;
* test preparation workbook;
* additional subject.

### Coaching

* additional coaching session;
* assessment;
* 360-degree feedback;
* résumé review;
* leadership profile.

### Consulting

* additional consulting hours;
* additional site visit;
* expedited delivery;
* employee training;
* additional process documentation.

---

# 30. Overage Pricing

Very important for consulting.

Example:

```text
Package includes:
10 consulting hours/month

Additional Hours:
$225/hour

Approval Required:
Yes

Notify Client:
At 80% utilization
```

The application should alert:

> 8 of 10 consulting hours used.

Then:

> 10 of 10 hours used. Additional work requires approval at $225/hour.

---

# 31. Client Responsibilities

Every package should optionally define responsibilities required from the customer.

Examples:

### Consulting

* provide requested documents;
* provide system access;
* attend review meetings;
* approve deliverables;
* provide stakeholder availability.

### Coaching

* complete intake;
* attend sessions;
* complete assessments;
* communicate scheduling changes.

### Tutoring

* provide school/course information;
* bring materials;
* attend sessions;
* parent provides academic records where applicable.

This is particularly important in consulting, where client delays in providing access, information, or approvals can materially delay completion.

---

# 32. Progress and Outcomes

The Package Engine should allow:

```text
Outcome Tracking:
○ None
○ Optional
○ Required
```

Possible outcomes:

* goals;
* baseline;
* target;
* measures;
* milestones;
* evaluations;
* progress reports;
* completion summary.

The exact implementation differs significantly across service categories.

---

# 33. CONSULTING

Consulting should use the universal Package Engine but add a **Scope & Deliverables Layer**.

This is the biggest difference from tutoring and coaching.

A consultant is often selling:

> expertise + access + deliverables + implementation

rather than simply appointments.

---

# 34. Consulting-Specific Package Fields

Add:

### Engagement Type

* Advisory
* Assessment
* Strategy
* Implementation
* Project
* Retainer
* Fractional Role
* Training
* Audit
* Other

### Scope

Rich-text scope description.

### Deliverables

Individually defined.

Example:

```text
Deliverable 1
Current-State Operations Review

Deliverable 2
Workflow Map

Deliverable 3
Recommended SOP Structure

Deliverable 4
90-Day Implementation Plan
```

### Milestones

Each milestone can have:

* target date;
* payment;
* deliverables;
* approval status;
* dependencies.

### Client Dependencies

Example:

> Client must provide requested documents within five business days.

### Revision Allowance

Example:

> 2 revision rounds included.

### Change Order Required

Yes / No.

---

# 35. Consulting Requires Change Orders

This is one of the most important differences.

A client saying:

> "Could you also redesign our onboarding system?"

should not quietly consume the same package.

System workflow:

```text
NEW REQUEST
     ↓
In Scope?
├── YES → Add to engagement
└── NO
     ↓
Change Request
     ↓
Cost / Timeline Impact
     ↓
Client Approval
     ↓
Change Order
```

Out-of-scope requests and formal mechanisms for adjusting scope are standard considerations in strong consulting agreements.

---

# 36. Consulting Cancellation Is Different

Cancelling a meeting is different from cancelling consulting work.

Example:

### Meeting Cancellation

48-hour policy.

### Project Termination

30-day notice or project-specific terms.

### Deliverables Already Completed

Remain billable.

### Work in Progress

Handled according to contract.

Do not consume an entire consulting package simply because one meeting was cancelled.

---

# 37. Example Consulting Packages

These examples are recommended product structures for the application rather than quoted market prices.

## Consultant Strategy Session

**$450**

Includes:

* pre-session questionnaire;
* 90-minute consultation;
* written recommendations;
* 7-day follow-up message access.

Payment:

* 100% upfront.

Cancellation:

* free reschedule with 48 hours' notice;
* <48 hours consumes the consultation;
* one emergency administrative exception permitted.

Expiration:

* must occur within 60 days.

---

## Business Systems Diagnostic

**$1,500**

Includes:

* discovery meeting;
* review of existing processes;
* 3 stakeholder interviews;
* workflow assessment;
* written findings report;
* 60-minute findings meeting.

Payment:

* $1,500 upfront

or

* $800 deposit + $800 final payment.

Package value using installments: $1,600.

Cancellation:

* appointment policy applies only to scheduled meetings.

Project termination:

* deposit non-refundable after work begins;
* remaining terms established in engagement agreement.

---

## Implementation Sprint

**$6,000**

Duration:

6 weeks.

Includes:

* process redesign;
* 4 consulting meetings;
* workflow diagrams;
* SOP recommendations;
* implementation support.

Payment:

```text
50% at start
25% at midpoint
25% at final delivery
```

Includes:

2 revision rounds.

Additional work:

$225/hour with approval.

Change order:

required for expanded scope.

---

## Fractional Advisory Retainer

**$2,500/month**

Includes:

* two 60-minute strategy meetings;
* up to 8 consulting hours;
* email/portal support;
* priority response;
* monthly operating review.

Minimum commitment:

3 months.

Billing:

monthly in advance.

Meeting cancellation:

48 hours.

Termination:

30-day notice.

Unused hours:

do not roll over.

Overage:

$250/hour.

This type of structure aligns well with how consulting retainers reserve recurring capacity while defining scope, monthly limits, structured touchpoints, communication expectations, and out-of-scope work.

---

# 38. COACHING

Coaching should use the universal engine but add an **Engagement & Goals Layer**.

The key difference is that coaching is usually not simply:

> Buy six appointments.

Instead:

> Engage in a structured developmental relationship for a defined period.

---

# 39. Coaching-Specific Package Fields

Add:

### Coaching Type

* Life Coaching
* Executive Coaching
* Leadership Coaching
* Career Coaching
* Business Coaching
* Performance Coaching
* Wellness Coaching
* Other

### Engagement Length

Examples:

* 6 weeks
* 3 months
* 6 months
* 12 months

### Recommended Cadence

* Weekly
* Every other week
* Monthly
* Flexible

### Coaching Goals

Captured during enrollment.

### Baseline Assessment

Optional.

### Progress Review

Optional or required.

### Sponsor

Useful for executive coaching.

Could contain:

```text
Client: Employee
Sponsor: Employer
Payer: Employer
```

### Confidentiality Rules

Especially important where an employer pays.

ICF standards specifically emphasize establishing the nature of coaching, responsibilities, confidentiality, financial arrangements, and other engagement expectations with clients and sponsors before coaching begins.

---

# 40. Coaching Package Examples From the Market

A particularly useful real-world example is Chicago Booth's current executive coaching structure.

As of 2026 it offers:

* **Executive Insight:** one 90-minute session for $900;
* **Leadership Pivot:** four 50-minute sessions for $3,200;
* **Executive Evolution:** eight 50-minute sessions for $5,600.

The larger packages may also include items beyond the appointment itself, including assessments, workbooks, email support, voice-note support, or toolkits.

That illustrates an important application principle:

> Higher coaching packages should be able to contain more than "more sessions."

They can unlock **support and resources**.

---

# 41. Recommended Coaching Package Structures

## Coaching Clarity Session

**1 × 90-minute session**

Includes:

* intake;
* coaching session;
* action summary.

Payment:

upfront.

Expires:

60 days.

Best for:

one specific issue or decision.

---

## Coaching Momentum

**6 sessions over approximately 3 months**

Includes:

* initial goals assessment;
* 6 × 50-minute sessions;
* action plan;
* portal resources.

Recommended cadence:

biweekly.

Rescheduling:

24+ hours free.

Late cancellation:

session consumed.

Courtesy:

1 late reschedule per package.

Payment:

```text
$1,200 upfront

or

3 × $425
Total $1,275
```

---

## Coaching Accelerator

**12 sessions over 6 months**

Includes:

* intake assessment;
* 12 coaching sessions;
* between-session messaging;
* progress review;
* completion summary.

Payment:

```text
Pay in full:
$2,250

6 monthly payments:
$400
Total $2,400
```

This general pay-in-full-versus-installment pattern is already used in current coaching offerings.

---

# 42. Coaching Matching

The application should optionally include:

```text
Coach Matching Required: Yes

Intro / Chemistry Call:
Included

Complimentary Reassignment:
1
```

This is a sophisticated feature worth supporting.

Chicago Booth's coaching process currently includes coach selection and fit/chemistry procedures, with one complimentary reassignment after the engagement begins under specified conditions.

---

# 43. Coaching Completion

A coaching package completion could generate:

> Coaching Engagement Summary

Containing:

* goals established;
* topics addressed;
* milestones;
* client self-ratings;
* progress;
* recommended next steps;
* continuation options.

Not clinical documentation.

---

# 44. Coaching Boundary

The package should permit a clear service-scope statement.

For example:

> Coaching is a developmental service and is not psychotherapy, mental-health treatment, legal advice, medical care, or another regulated professional service unless separately and appropriately provided.

Chicago Booth similarly distinguishes its executive coaching services from psychotherapy and other professional advisory services.

---

# 45. TUTORING

Tutoring should use the universal engine but add a **Student, Subject & Learning Plan Layer**.

Unlike coaching and consulting, the purchaser and participant are frequently different people.

Example:

```text
Purchaser:
Parent

Participant:
Student

Provider:
Tutor
```

The application must support this natively.

---

# 46. Tutoring-Specific Package Fields

### Student

Required.

### Parent / Guardian

Optional/required depending on age.

### Subject

* Math
* Reading
* Writing
* Science
* SAT
* ACT
* Executive Function
* Homework Support
* Other

Allow multiple subjects.

### Grade Level

### School

Optional.

### Academic Goals

### Initial Evaluation

* Required
* Optional
* Included
* Separately purchased

### Learning Plan

* Required
* Optional
* AI generated from evaluation

### Session Length

* 30 minutes
* 45 minutes
* 60 minutes
* 90 minutes
* Custom

### Recurring Slot

Often useful.

### Tutor Assignment

### Progress Reporting

Configure:

* every session;
* every four sessions;
* monthly;
* completion;
* custom.

---

# 47. Tutoring Packages Should Usually Be Credit-Based

Example:

```text
Math Momentum

Purchased:
8 tutoring credits

Each 60-minute tutoring session:
Consumes 1 credit

Balance:
5 credits
```

This makes rescheduling and cancellation easy to understand.

---

# 48. Tutoring Pay-As-You-Go

Example:

## Tutoring Flex

**$80 per 60-minute session**

No commitment.

Payment:

card charged at booking.

Cancellation:

24+ hours:

> no charge / payment returned.

<24 hours:

> $60 late cancellation fee.

No show:

> $80.

This is appropriate for families who want flexibility without committing to a package.

---

# 49. Tutoring Monthly Package

## Academic Momentum

**4 × 60-minute sessions/month**

Standard value:

$320.

Package:

**$300/month**

Includes:

* four tutoring sessions;
* assigned tutor;
* learning plan;
* parent progress update.

Cancellation:

24+ hours:

credit restored.

<24 hours:

credit forfeited.

No-show:

credit forfeited.

Rollover:

maximum 1 session.

Expiration:

rollover credit expires next month.

---

# 50. Tutoring Intensive Package

## Academic Accelerator

**8 × 60-minute sessions**

Standard price:

$640.

Package:

**$560 upfront**

or

**2 × $300 installments**

Total installment price:

$600.

Includes:

* academic evaluation;
* individualized learning plan;
* eight sessions;
* parent progress dashboard;
* completion evaluation.

Expiration:

90 days.

Rescheduling:

24+ hours permitted.

Courtesy:

one late reschedule.

Tutoring policies currently in the market commonly restore prepaid session credits for timely cancellations while forfeiting the session credit for late cancellations or no-shows.

---

# 51. Tutoring Semester Plan

This will likely be particularly useful.

## Semester Success

**16 weekly sessions**

Duration:

one school semester.

Includes:

* evaluation;
* learning plan;
* reserved weekly tutoring slot;
* 16 tutoring sessions;
* parent updates;
* midpoint evaluation;
* final learning summary.

Payment:

```text
$1,100 upfront

or

4 × $300
Total $1,200
```

Reserved weekly slot:

Yes.

Cancellation:

24+ hours allows rescheduling.

Late cancellation:

session consumed.

School closure:

session restored automatically.

Tutor cancellation:

session restored automatically.

Vacation pause:

one pause up to two weeks.

Unused sessions:

expire 30 days following semester end.

---

# 52. Recurring Tutoring Slots Need Special Treatment

A recurring slot represents reserved capacity.

Example:

> Tuesdays at 4:00 PM with Alex.

The package should separately track:

```text
Recurring Slot Reserved: Yes

Late Cancellation:
Consumes session

Repeated Cancellations:
3

Action:
Review recurring reservation
```

Possible result:

> Your tutoring package remains active, but your reserved Tuesday 4 PM slot has been released.

That is much better than automatically cancelling the entire package.

---

# 53. School Closure Rules

Especially important for tutoring.

Allow automatic rules:

```text
School Closure:
Restore session

Snow Day:
Restore session

Provider Unavailable:
Restore session

Family Vacation:
Normal cancellation policy

Student Illness:
Courtesy policy

Testing Day:
Administrator configurable
```

---

# 54. Tutoring Should Connect Package → Evaluation → Learning Plan

A strong workflow would be:

```text
PACKAGE PURCHASE
       ↓
STUDENT PROFILE
       ↓
INITIAL EVALUATION
       ↓
RESULTS
       ↓
AI-ASSISTED LEARNING PLAN
       ↓
TUTOR ASSIGNMENT
       ↓
SESSIONS
       ↓
SESSION SUMMARIES
       ↓
PROGRESS DATA
       ↓
LEARNING PLAN ADJUSTMENT
       ↓
COMPLETION EVALUATION
       ↓
FINAL LEARNING SUMMARY
       ↓
RECOMMENDED NEXT PACKAGE
```

The package engine itself should trigger this workflow rather than attempt to contain all of the academic information.

---

# 55. What Should Stay the Same Across ALL THREE Fields?

These should use the exact same underlying application components.

| Function              | Consulting | Coaching | Tutoring |
| --------------------- | ---------- | -------- | -------- |
| Package Name          | ✓          | ✓        | ✓        |
| Description           | ✓          | ✓        | ✓        |
| Price                 | ✓          | ✓        | ✓        |
| Payment Options       | ✓          | ✓        | ✓        |
| Upfront Discount      | ✓          | ✓        | ✓        |
| Payment Plan          | ✓          | ✓        | ✓        |
| Autopay               | ✓          | ✓        | ✓        |
| Entitlements          | ✓          | ✓        | ✓        |
| Expiration            | ✓          | ✓        | ✓        |
| Cancellation          | ✓          | ✓        | ✓        |
| Rescheduling          | ✓          | ✓        | ✓        |
| No-Show               | ✓          | ✓        | ✓        |
| Courtesy Exception    | ✓          | ✓        | ✓        |
| Refund Rules          | ✓          | ✓        | ✓        |
| Package Termination   | ✓          | ✓        | ✓        |
| Provider Cancellation | ✓          | ✓        | ✓        |
| Add-Ons               | ✓          | ✓        | ✓        |
| Promo Codes           | ✓          | ✓        | ✓        |
| Agreement             | ✓          | ✓        | ✓        |
| Package Version       | ✓          | ✓        | ✓        |
| Payment History       | ✓          | ✓        | ✓        |
| Usage Ledger          | ✓          | ✓        | ✓        |
| Assigned Provider     | ✓          | ✓        | ✓        |
| Notes                 | ✓          | ✓        | ✓        |
| Client Portal         | ✓          | ✓        | ✓        |
| Admin Override        | ✓          | ✓        | ✓        |
| Audit Trail           | ✓          | ✓        | ✓        |

---

# 56. What Should Be Different?

| Area                   | Consulting          | Coaching                          | Tutoring                   |
| ---------------------- | ------------------- | --------------------------------- | -------------------------- |
| Primary unit           | Hours/deliverables  | Sessions                          | Sessions                   |
| Main objective         | Business outcome    | Personal/professional development | Academic progress          |
| Typical duration       | Project/monthly     | 3–12 months                       | Month/semester             |
| Participant            | Business/client     | Individual                        | Student                    |
| Payer                  | Business            | Client/employer                   | Parent/student             |
| Scope management       | Critical            | Moderate                          | Low                        |
| Change orders          | Yes                 | Rare                              | No                         |
| Deliverables           | Major               | Sometimes                         | Learning materials/reports |
| Learning plan          | No                  | Goals/action plan                 | Yes                        |
| Assessment             | Business diagnostic | Coaching assessment               | Academic evaluation        |
| Between-session access | Often               | Often                             | Sometimes                  |
| Reserved capacity      | Retainer            | Sometimes                         | Weekly slot                |
| Progress tracking      | Milestones/KPIs     | Goals                             | Academic skills            |
| Provider matching      | Expertise           | Coach fit                         | Subject/grade fit          |
| Termination model      | Contract/SOW        | Coaching agreement                | Enrollment/package         |
| Parent portal          | No                  | Usually no                        | Important                  |

---

# 57. Recommended Default Policy Profiles

The administrator should be able to click:

> **Start From Recommended Defaults**

and then modify them.

## Consulting Default

```text
Meeting Cancellation:
48 hours

Late Meeting:
Meeting entitlement consumed

No Show:
Meeting consumed

Project Cancellation:
Separate termination terms

Payment:
Upfront or milestone

Unused Retainer:
No rollover

Overage:
Allowed with approval

Change Orders:
Enabled

Client Delay:
May extend timeline

Provider Cancellation:
Reschedule without penalty
```

---

## Coaching Default

```text
Cancellation:
24–48 hours

Late Cancellation:
Session consumed

No Show:
Session consumed

Courtesy:
1 per package

Expiration:
Based on engagement duration

Payment:
Upfront or installments

Goals:
Required

Between-Session Support:
Package configurable

Coach Reassignment:
Optional

Provider Cancellation:
Restore session
```

A 24–48-hour framework is consistent with common coaching agreements and current package examples.

---

## Tutoring Default

```text
Cancellation:
24 hours

Timely Cancellation:
Restore credit

Late Cancellation:
Forfeit credit

No Show:
Forfeit credit

Courtesy:
1 optional

Recurring Slot:
Supported

Rollover:
Limited

School Closure:
Restore credit

Tutor Cancellation:
Restore credit

Learning Plan:
Enabled

Progress Reporting:
Enabled
```

A 24-hour framework and credit forfeiture model are common in current tutoring policies.

---

# 58. The Package Policy Screen Should Be Human-Readable

Do not force administrators to interpret dozens of raw toggles.

Show something like:

## Cancellation & Rescheduling

**Clients may reschedule:**
Yes

**Free rescheduling:**
Until 24 hours before the appointment

**If cancelled less than 24 hours before:**
1 session credit is used

**No-show:**
1 session credit is used

**Courtesy exceptions:**
1 per package

**Provider cancellation:**
Credit is automatically restored

**Emergency overrides:**
Staff may approve

Then have:

> Advanced Settings

for unusual configurations.

---

# 59. Customer-Facing Policy Preview

While building a package, the system should automatically generate understandable text.

Example:

### Your Scheduling Flexibility

You may cancel or reschedule your tutoring session at least 24 hours before your scheduled appointment without losing a session. Your session credit will automatically return to your available balance.

Changes made less than 24 hours before the appointment will normally use one session from your package.

Your package includes one courtesy late reschedule.

If your tutor needs to cancel, your session will never be lost and your credit will automatically be restored.

This generated preview should change instantly as the administrator modifies rules.

---

# 60. Package Comparison

The public/client interface should allow packages to compare naturally.

Example:

|                      |  Flex | Momentum | Accelerator |
| -------------------- | ----: | -------: | ----------: |
| Sessions             |  PAYG |        4 |           8 |
| Cost/session         |   $80 |      $75 |         $70 |
| Learning Plan        |     — |        ✓ |           ✓ |
| Progress Reports     |     — |        ✓ |           ✓ |
| Free Late Reschedule |     — |        — |           1 |
| Priority Scheduling  |     — |        — |           ✓ |
| Parent Dashboard     | Basic |        ✓ |           ✓ |
| Payment Plan         |     — |        — |           ✓ |

The higher package doesn't only offer cheaper sessions.

It offers **more value and more flexibility**.

That is an important package-design principle.

---

# 61. Discounts

Universal support for:

* percentage discount;
* fixed discount;
* promotional code;
* employee discount;
* sibling discount;
* multiple-service discount;
* returning client discount;
* scholarship;
* school partner discount;
* referral discount;
* promotional campaign.

Discounts should attach to the purchase—not permanently alter the package's base price.

---

# 62. Package Upgrade

Allow:

> Upgrade Package

Example:

```text
Momentum
4 sessions
$300

↓

Accelerator
8 sessions
$560
```

System calculates:

* amount already paid;
* unused entitlements;
* upgrade credit;
* amount due.

---

# 63. Package Downgrade

Possible, but package-specific.

Options:

* not allowed;
* next billing cycle;
* administrator approval;
* after minimum term.

---

# 64. Renewal

Packages should support:

```text
Auto Renew:
Yes / No

Renew:
Same package
Latest package version
Ask customer
Custom
```

Important:

If the price changed since the original purchase, do not silently move the customer to a new price without the appropriate notice/authorization workflow.

---

# 65. Completion & Renewal Recommendations

When a package nears completion:

> You have 2 tutoring sessions remaining.

Then:

> Based on the student's learning plan and current progress, Academic Momentum is recommended for continued support.

Similarly:

### Coaching

> 2 sessions remaining → Continue Coaching.

### Consulting

> Engagement 80% complete → Transition to Advisory Retainer.

---

# 66. Administrative Package Dashboard

For each active package show:

```text
Academic Accelerator

CLIENT
Jamie R.

STATUS
Active

PURCHASED
Aug 1

EXPIRES
Oct 30

USAGE
████████░░
6 / 8 sessions

PAYMENT
Paid in Full

RESCHEDULES
1 courtesy remaining

NEXT SESSION
Aug 28 • 4:00 PM

PROVIDER
Alex Morgan

PROGRESS
On Track
```

---

# 67. Organization-Wide Policy Hierarchy

Use rule inheritance.

Recommended hierarchy:

```text
ORGANIZATION DEFAULT
       ↓
SERVICE CATEGORY DEFAULT
       ↓
SERVICE DEFAULT
       ↓
PACKAGE VERSION
       ↓
CUSTOMER PURCHASE EXCEPTION
       ↓
ADMINISTRATIVE EVENT OVERRIDE
```

Example:

### Organization

24-hour cancellation.

### Coaching

48-hour cancellation.

### Premium Executive Coaching

48 hours + one courtesy exception.

### Specific Client

Contractually receives two courtesy exceptions.

This prevents duplicating policies everywhere.

---

# 68. Package Rules Should Be Configurable, Not Hard-Coded

Avoid programming:

```text
if tutoring:
    cancellation = 24
```

Instead:

```text
Tutoring recommended template:
24 hours
```

Administrators can modify it.

A premium tutor could use 48 hours.

A consulting company could allow 24.

A coaching business could allow same-day rescheduling.

The application should provide **good defaults without forcing business policy**.

---

# 69. Suggested Technical Package Structure

Conceptually:

```yaml
package:
  category: tutoring
  type: prepaid_bundle

  pricing:
    retail_value: 640
    options:
      - type: pay_in_full
        total_price: 560

      - type: installments
        total_price: 600
        installments: 2
        amount: 300

  entitlements:
    - type: session
      quantity: 8
      duration_minutes: 60

    - type: evaluation
      quantity: 1

    - type: learning_plan
      quantity: 1

  scheduling:
    recurring_allowed: true
    self_booking: true

  cancellation:
    notice_hours: 24

    timely:
      action: restore_credit

    late:
      action: consume_credit

    no_show:
      action: consume_credit

    courtesy_events:
      quantity: 1

  provider_cancellation:
    action: restore_credit

  expiration:
    method: days_after_purchase
    days: 90

  rollover:
    enabled: false

  domain:
    tutoring:
      evaluation_required: true
      learning_plan_required: true
      progress_tracking: true
```

A coaching package uses essentially the same object:

```yaml
package:
  category: coaching
  type: commitment

  entitlements:
    - type: coaching_session
      quantity: 6
      duration_minutes: 50

    - type: portal_support
      quantity: unlimited

  engagement:
    duration_months: 3
    recommended_frequency: biweekly

  cancellation:
    notice_hours: 48
    late_action: consume_credit
    no_show_action: consume_credit
    courtesy_events: 1

  domain:
    coaching:
      goals_required: true
      confidentiality_agreement: true
      progress_review: true
```

And consulting:

```yaml
package:
  category: consulting
  type: retainer

  billing:
    frequency: monthly
    amount: 2500
    minimum_months: 3

  entitlements:
    - type: consulting_hours
      quantity: 8

    - type: strategy_meeting
      quantity: 2

    - type: priority_support
      quantity: unlimited

  overage:
    enabled: true
    hourly_rate: 250
    approval_required: true

  cancellation:
    meeting_notice_hours: 48

  termination:
    notice_days: 30

  rollover:
    enabled: false

  domain:
    consulting:
      scope_required: true
      deliverables_enabled: true
      change_orders_enabled: true
```

Same engine.

Different configuration.

---

# 70. Important Edge Cases the Application Should Handle

The system should explicitly account for:

1. Client cancels early.
2. Client cancels late.
3. Client does not show.
4. Client arrives late.
5. Provider cancels.
6. Provider is late.
7. Technical problem prevents virtual session.
8. School closes.
9. Severe weather.
10. Package expires with unused credits.
11. Client requests refund.
12. Payment fails.
13. Client changes provider.
14. Client changes tutor.
15. Client pauses package.
16. Client wants to upgrade.
17. Client wants to downgrade.
18. Client disputes cancellation.
19. Client purchases additional sessions.
20. Customer receives promotional credit.
21. Administrator manually adjusts credit.
22. Consulting project goes out of scope.
23. Consulting client delays deliverables.
24. Coaching client wishes to end engagement.
25. Student changes subjects.
26. Student changes tutors.
27. Package is renewed at a new price.
28. Installment remains unpaid.
29. Customer wants to transfer package.
30. Provider leaves organization.

Do not wait for these situations to appear after launch.

Build the policy architecture so they are expected.

---

# 71. Keep Provider Compensation Separate

One particularly important architecture rule:

> **Customer package pricing should not determine provider compensation.**

Example:

Parent purchases:

> 8 tutoring sessions for $560.

That does not mean:

> Tutor receives $70/session.

There should be separate systems for:

```text
Customer Revenue
≠
Provider Compensation
```

This allows:

* promotional pricing;
* scholarships;
* discounts;
* payment-plan pricing;
* package discounts;
* different tutor rates;
* employee vs contractor compensation;
* agency margin;
* administrative cost.

The package should generate the service entitlement.

The compensation engine determines how the provider is paid for delivering it.

---

# 72. Recommended MVP

For the initial implementation, I would support six package models:

1. **Pay As You Go**
2. **Prepaid Session Bundle**
3. **Recurring Monthly Package**
4. **Fixed Commitment With Payment Plan**
5. **Consulting Retainer**
6. **Consulting Project**

And build these universal rule engines immediately:

### Financial

* upfront payment;
* installments;
* recurring payment;
* discounts;
* failed payment;
* refunds.

### Entitlements

* session;
* hour;
* deliverable;
* support;
* custom entitlement.

### Scheduling

* self-book;
* recurring;
* provider assignment.

### Policies

* cancellation notice;
* late cancellation;
* no-show;
* rescheduling;
* courtesy events;
* provider cancellation;
* expiration;
* rollover;
* pause;
* termination.

### Administration

* package version;
* manual adjustment;
* override;
* audit log.

That is enough to support sophisticated services without overbuilding the first version.

---

# 73. Recommended Phase Two

Then add:

* package upgrades;
* package downgrades;
* AI-generated package recommendations;
* dynamic renewal offers;
* consulting milestones;
* change orders;
* deliverable approvals;
* coaching goal tracking;
* coaching sponsor relationships;
* tutor/student matching;
* academic evaluations;
* AI-generated learning plans;
* academic progress dashboards;
* parent reporting;
* package comparison tools;
* dynamic promotional pricing;
* scholarships;
* corporate/employer-sponsored packages;
* school-sponsored tutoring packages.

---

# 74. Recommended Long-Term Intelligence

Eventually the application should be able to recommend package configurations.

Example:

> **Create New Tutoring Package**

Administrator enters:

* 60-minute sessions;
* middle-school mathematics;
* twice weekly recommended;
* average program lasts 12 weeks;
* standard session rate $80.

AI could recommend:

### Academic Foundations

4 sessions
$300

### Academic Momentum

8 sessions
$560

### Academic Accelerator

16 sessions
$1,040

And recommend:

> 24-hour cancellation
> one courtesy late reschedule on Accelerator
> 90-day expiration
> recurring weekly slots
> limited rollover

The administrator then approves or changes those recommendations.

The same system could build coaching and consulting offers.

---

# 75. The Most Important Product Principle

The app should never ask only:

> **How many sessions are included?**

It should ask:

> **What is the customer actually purchasing?**

Then separately:

### What do they receive?

Entitlements.

### How do they pay?

Billing.

### How long do they have?

Duration and expiration.

### How do they use it?

Scheduling.

### What happens when plans change?

Cancellation/rescheduling.

### What happens if they stop?

Termination/refunds.

### What happens if more work is needed?

Add-ons/overages.

### What outcome are we working toward?

Progress/outcome structure.

That model works for all three service areas without forcing consulting, coaching, and tutoring to behave identically.

---

# 76. Final Recommended Mental Model

The best architecture is:

```text
                         PACKAGE ENGINE
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
      PRICE                ENTITLEMENTS            POLICIES
        │                      │                      │
  ┌─────┴─────┐        ┌───────┴────────┐     ┌───────┴────────┐
Upfront    Payment     Sessions       Hours   Cancellation   Expiration
           Plans       Deliverables   Access  Reschedule     Refund
           Recurring   Resources      Etc.    No Show        Termination

                               │
                               ▼
                       SERVICE EXPERIENCE
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
        CONSULTING          COACHING          TUTORING
             │                 │                 │
           Scope              Goals            Student
        Deliverables       Engagement          Subject
        Milestones        Confidentiality    Evaluation
       Change Orders       Coach Matching    Learning Plan
          KPIs             Development       Academic Data
```

The common engine should handle the **commercial relationship**.

The service modules should handle the **professional experience**.

That separation will make the system substantially easier to expand later.

---

# 77. Recommended Rule of Thumb by Industry

### Tutoring

Sell **access to academic support + session credits + measurable academic progression**.

Packages should primarily differentiate on:

* frequency;
* price per session;
* evaluation;
* learning plan;
* progress reporting;
* scheduling priority;
* flexibility.

### Coaching

Sell **a developmental engagement**, not merely hours.

Packages should primarily differentiate on:

* engagement duration;
* number of sessions;
* assessments;
* between-session access;
* resources;
* coach access;
* progress reviews;
* depth of support.

### Consulting

Sell **expertise, capacity, deliverables, and business outcomes**, not simply meetings.

Packages should primarily differentiate on:

* scope;
* access;
* deliverables;
* reserved capacity;
* turnaround;
* implementation support;
* communication access;
* strategic involvement;
* measurable milestones.

---

# 78. Bottom-Line Recommendation

Build **one package infrastructure**, but do not make the mistake of forcing every package to represent sessions.

The application's universal building blocks should be:

> **Package + Entitlements + Billing Options + Policy Set + Duration + Enrollment + Usage Ledger + Agreement**

Then layer:

> **Consulting = Scope + Deliverables + Milestones + Change Orders**

> **Coaching = Engagement + Goals + Confidentiality + Coach Relationship**

> **Tutoring = Student + Subject + Evaluation + Learning Plan + Academic Progress**

That gives you a package system capable of supporting simple offerings such as:

> $80 pay-as-you-go tutoring

all the way through:

> $25,000 six-month consulting engagement with milestones, retainers, hours, deliverables, and installment billing

without needing to redesign the fundamental package infrastructure later.
