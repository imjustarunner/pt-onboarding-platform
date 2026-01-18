# Bulk Client Upload – Detailed Functional & Data Specification

## Overview

This document defines the required behavior, data handling rules, permissions, and system logic for **Bulk Client Upload**.
The upload will ingest a large file (e.g., CSV/XLSX) with predefined columns. Each column triggers specific creation, validation, automation, and permission logic across **Clients, Providers, Schools, Agencies, and Notifications**.

This document is **authoritative** for how bulk upload must behave.

---

## 1. File Structure & Processing Rules

### 1.1 Accepted File Types

* CSV
* XLSX

### 1.2 Upload Behavior

* Each row represents **one client**
* Upload must be atomic per row:

  * If a required dependency fails (e.g., Provider invalid), the row fails with an error message
  * Other rows continue processing
* Upload logs must record:

  * Who uploaded
  * Timestamp
  * Number of rows processed
  * Success/failure per row

---

## 2. Column Definitions & Required Logic

### Client Name

**Input:** First 3 letters of first name (capitalized first letter)
  * First letter of last name (capitalized)
  * Total length = 6 characters
  * Example: `Messi Junior → MesJuv`
  *Sometimes the name is longer than six characters if they have a longer hyphenated last name, keep all that is there. 
* This identifier:

  * Is used to create a **new client account**
  * Must be unique within the agency
  * If conflict occurs, system appends a numeric suffix

---

### Status

**Allowed Values (Editable by Agency):**

* Current
* Pending
* Terminated
* Inactive
* Waitlist
* Screener
* Packet

**Rules:**

* Stored **separately** from other program statuses
* Each status must have:

  * A description editable in **Client Settings**
  * Meaning accessible to the **Agent API** for automated email replies
* Agencies may rename or redefine statuses
* Bulk upload validates against **current agency-defined statuses**

---

### Referral Date

* Represents:

  * Packet submission date **OR**
  * Date client was added to the system
* This is the **first initiation date**
* **Non-editable after upload**

---

### Skills

* Boolean
* Indicates participation in a skills-based program

---

### Insurance

**Default Options (Agency Editable – NOT school-level):**

* Medicaid
* Tricare
* Commercial / Other
* Unknown
* None
* Self Pay

**Rules:**

* Only providers **assigned to the client’s school** appear as selectable
* Provider eligibility is determined by:

  * Credential defaults
  * Individual provider overrides
* Tricare:

  * Must be assigned **manually per provider**
* Insurance options are editable in **Client Settings**, not school settings

---

### School

* Creates or links a **School Organization**
* Each school:

  * Is associated with **one district**
  * Belongs to an agency
* School creation records:

  * Who established it
  * Who accepted billing terms

---

### Provider

**Behavior:**

* Creates or links a **Provider Account**

**Provider Attributes:**

* Active / Inactive status
* Credential (editable by admin/staff):

  * Bachelors
  * Intern
  * LPC
  * LPCC
  * MFT
  * MFTC
  * Peer Professional
  * SWC
  * LCSW
  * LMFT
  * Unknown

**Credential → Insurance Mapping**

* Editable in Provider Settings
* Checkbox-based:

  * Medicaid
  * Commercial / Other
  * Self Pay
  * Others as defined

**School Assignment Structure:**

* Provider can have multiple school assignments
* Each assignment includes:

  * School
  * Day(s)
  * Starting available client slots per day

Example:

* Rudy Elementary – Monday – 7 slots
* Rudy Elementary – Tuesday – 4 slots

---

### Background Check (Provider-Level)

* Checklist item with:

  * Hardcoded completion date
  * Renewal required every **5 years**
* Provider uploads receipt
* Receipt upload:

  * Automatically checks checklist item
* Reimbursement:

  * Triggered **6 months after start date**
  * Notification sent to staff/admin
  * Marked complete manually
* Boolean:

  * **Cleared to Start** (manual)

---

### Provider Risk Flags

Boolean checkboxes:

* High Behavior
* Suicidal
* Substance Use
* Trauma
* Skills

**Notes:**

* Admin & staff only
* Not visible to providers or schools

---

### Provider Availability

* Entered manually or auto-populated from onboarding
* Must support:

  * Day of week
  * Timeframe
  * School-specific availability
* Availability **only exists** if provider is associated with that school

> Note: Availability module requires additional customization beyond standard onboarding items.

---

### Day (Client-Level)

* Monday–Friday only
* Can only be selected:

  * AFTER provider is assigned
  * If provider works that day at that school
  * If provider has available slots
* Each client assignment:

  * Reduces provider availability by 1
* Reports must show:

  * Open availability
  * By provider
  * By school
  * By day

---

### Paperwork Delivery

**Editable (School-Level Setting):**

* Uploaded
* School Emailed
* Set Home
* Unknown

**System Awareness:**

* If uploaded → system auto-detects
* If emailed → system auto-detects

---

### Doc Date

* Associated with Paperwork Delivery
* Required when delivery method is provided

---

### Paperwork Status

**Editable by Agency**
Each status includes a description for AI use.

Default options:

* Completed
* Re-Auth
* New Insurance
* Insurance / Payment Auth
* Emailed Packet
* ROI
* Renewal
* New Docs
* Disclosure and Consent
* BALANCE

**Rules:**

* Fully searchable
* Sortable
* Used for reporting
* Triggers notifications

---

### Notes (Client-Level)

* Admin & staff only
* Not visible to school staff or providers

---

### Grade

* Stored on client account
* Pulled from packet or intake

---

### Gender

* Stored on client account
* Only if included in intake or packet

---

### Identifier Code

* Auto-generated
* 6-digit random numeric string
* Used for de-identification

---

### District

* Pulled from school association
* Used in reports

---

### Primary Languages

* Primary Client Language
* Primary Parent Language
* Stored on client account

---

## 3. Permissions & Access Control

### School Staff

* Read-only access to most client data
* **No editing**
* No access to internal notes

### Agency Admin

* Can see all schools
* Can choose **not** to be associated to avoid notifications
* Can access schools via a global selector (read-only if not associated)

### School Admin

* Can add custom client variables
* Cannot edit system-level statuses

---

## 4. Notifications & Automation

### Paperwork Received

* Notifies:

  * Agency admin
  * Agency staff
* Does **not** notify school staff

### Client Becomes Current

Triggered when:

* Provider is assigned **AND**
* Day is selected

Notifications sent to:

* Provider
* Agency staff
* School staff

---

## 5. PHI & Document Access

* Uploaded packets are **tracked as PHI**
* Every access is logged
* On document open:

  * Warning modal:

    > “Please ensure you have approval to access this information.”
* Google Vision / OCR:

  * Extracts **limited fields only**
  * Not full document parsing

---

## 6. Reporting Requirements

Reports must support filtering by:

* Status
* Paperwork Status
* Provider availability
* School
* District
* Insurance
* Day
* Credential

---

## End of Specification
