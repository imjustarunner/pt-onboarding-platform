# Provider Onboarding – Modular Profile Integration Specification

## Overview

This document defines how the **Provider Onboarding Form** is decomposed into **separate, reusable onboarding modules**.
Each module:

* Can be **selectively assigned** to a user
* Writes directly to the **provider’s profile**
* May conditionally display fields based on **role, credential, or school affiliation**
* Can be reused outside onboarding (profile edits, re-credentialing, audits)

Modules **must not assume** all users receive all modules.

---

## Global Rules (Applies to All Modules)

* Each module:

  * Has its own completion state
  * Can be required or optional
  * Can be re-opened for edits (permission-based)
* Responses persist directly to:

  * `users`
  * `provider_profiles`
  * Related tables (licenses, schedules, specialties, etc.)
* Modules support **role-based branching**
* School-specific fields **only render if provider is affiliated with a school**

---

## Module 1: Identity & Access Setup

### Purpose

Establish the provider’s **internal identity**, access credentials, and compliance prerequisites.

### Data Writes To

* `users`
* `provider_profiles`
* `provider_identifiers`

### Fields

* Email (required)
* Primary work location
* NPI status:

  * Has NPI (Yes / No)
  * NPI number (if applicable)
  * ITSCO surrogate authorization (boolean)
* NPI creation assistance request (boolean)
* Research experience (text)
* Research interest (boolean)

### Conditional Logic

* If NPI = No → show guidance + assistance option
* If ITSCO creates NPI → flag profile for admin follow-up

---

## Module 2: Role & Position Classification

### Purpose

Determine onboarding path, permissions, and downstream module eligibility.

### Data Writes To

* `provider_profiles.role`
* `provider_profiles.position_type`

### Options

* Mental Health Provider (Master’s / Doctorate)
* Intern Mental Health Provider
* Mental Health Facilitator (QBHA / Bachelor’s)
* Bachelor’s-Level Provider (Approved for Counseling)

### Behavior

* Selection determines:

  * Which future modules are assigned
  * Credential requirements
  * Scheduling permissions

---

## Module 3: Work Schedule (Core Availability)

### Purpose

Define the provider’s **base working availability**.

### Data Writes To

* `provider_work_schedules`

### UI Requirements

* Day-based grid (Monday–Sunday)
* Hour blocks (e.g., 8–9 → 8 PM)
* Checkbox-based selection

### Rules

* This module is the **foundation schedule**
* Cannot be skipped if provider delivers services
* Editing later may restrict downstream schedules

---

## Module 4: School Availability & Capacity (School-Specific)

### Purpose

Capture **school-day availability** and **client capacity**.

### Visibility Rules

* Only shown if provider:

  * Is affiliated with ≥1 school
  * Has an existing Work Schedule

### Data Writes To

* `provider_school_schedules`
* `provider_school_capacity`

### Fields

* School selection (dropdown of assigned schools)
* Day selection (boolean per day)
* Time blocks (filtered from Work Schedule)
* Available slots (auto-default):

  * Default = number of hours selected
  * Editable by provider/admin

### Rules

* Slots decrement automatically as clients are assigned
* When slots = 0 → provider unavailable for that day/school

---

## Module 5: Counseling Information (Marketing Profile)

### Purpose

Generate **public-facing content** for website and referral platforms.

### Data Writes To

* `provider_marketing_profiles`

### Fields

* Description (optional)
* Ideal client (issues, needs, goals)
* How provider helps clients
* Empathy / outreach language
* Certifications (non-clinical)
* Relevant experience
* Client populations to avoid (scheduling constraint flag)

### Notes

* This module opens as a **modal**
* Language is reused verbatim unless edited by admin

---

## Module 6: Clinical Credentials & Compliance

### Purpose

Capture **licensure, credentialing, and payer compliance data**.

### Data Writes To

* `provider_licenses`
* `provider_credentials`
* `provider_payer_profiles`

### Fields

* Top 3 specialties (ranked)
* License type(s) + number(s)
* Licensed states
* License issue date
* License expiration date
* License document upload
* CAQH account + ID
* Medicaid ID + revalidation date
* Psychology Today profile preference
* Gender / ethnicity (optional, for matching)

### Compliance Rules

* License uploads are PHI-adjacent
* Expiration dates trigger reminders
* Missing required items block client assignment

---

## Module 7: Clinical Practice Profile

### Purpose

Define **clinical scope, modalities, populations, and treatment approaches**.

### Data Writes To

* `provider_clinical_profiles`
* `provider_specialties`
* `provider_modalities`

### Sections

* Clinical ideal client (expanded)
* Clinical outreach language
* Group leadership interest
* Specialty selections (max limits enforced)
* Diagnoses treated
* Populations served
* Age ranges
* Session formats (individual, family, group)
* Treatment modalities (max 15)
* Clinical certifications

---

## Module 8: Getting to Know You (Culture & Bio)

### Purpose

Humanize the provider and support **team culture + bio content**.

### Data Writes To

* `provider_bio_profiles`
* `provider_internal_notes`

### Fields

* Work philosophy
* Motivation for counseling
* Why ITSCO
* Personal values (safe-share only)
* Goals & aspirations (admin-only)
* Interests & hobbies
* Team activity interests
* Favorite quotes
* Open-ended personal notes

### Privacy Rules

* Some fields:

  * Public (website)
  * Internal only
  * Admin-only
* Each field must be tagged with visibility level

---

## Module Assignment Logic

* Modules are assigned based on:

  * Role
  * Credential
  * School affiliation
  * Program participation
* Admin can:

  * Add/remove modules
  * Reopen completed modules
  * Require re-completion after changes

---

## Implementation Notes

* Each module must:

  * Be independently renderable
  * Support partial saves
  * Validate only its own fields
* Profile updates occur **in real time**
* Module completion timestamps are stored

---

## End of Specification
