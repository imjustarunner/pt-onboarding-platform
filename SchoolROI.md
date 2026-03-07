# School ROI Workflow Specification

## Purpose

This document defines exactly what the School Release of Information (ROI) must do, how it must look, how it must behave step by step, and what data and permissions it must generate after completion. This is intended to be implementation-ready guidance for rebuilding the current ROI flow.

## Product Intent

The School ROI is a **single default, school-specific, interactive release of information workflow** built into the school portal section of the app.

It is not a generic upload-only document and not a static form. It must:

* be selectable from the client’s school ROI section
* be enabled within the school portal workflow
* be sent by copyable link or directly within the system
* pull school-specific data automatically
* guide the signer one section at a time
* allow approval or denial of specific release categories
* allow approval or denial of each individual school staff member
* create enforceable permissions in the app based on the signer’s responses
* document the completed ROI in the client record

## Core Functional Requirement

When a school is selected, the ROI must automatically populate the school’s saved data and produce a guided release flow for the client or guardian.

The system must use the signer’s responses to determine:

* which people are authorized
* which people are not authorized
* which information categories can be disclosed
* which information categories cannot be disclosed
* what app-based visibility, communication, and packet access should be allowed

## What the ROI Must Pull Automatically

When the user starts a school ROI for a client, the form must automatically pull:

* client first name and last name from intake
* client date of birth from intake
* parent/guardian name from intake when applicable
* school name
* school primary address
* school contact information as available
* all current school staff associated with that school
* each staff member’s role/relationship
* each staff member’s phone and email when available
* relationship context as student

This information must not need to be re-entered manually unless missing.

## Overall Experience Requirements

The ROI must **not** appear as one long legal paragraph.

It must be presented as a **step-by-step interactive workflow** with one clear section at a time.

Each step should include:

* a clear title
* a short explanation in plain language
* the relevant permission, acknowledgement, or selection
* required or optional status
* accept/decline or acknowledge controls where appropriate
* a next-step action

The signer should always understand:

* what they are reviewing
* why it matters
* whether the step is required
* what happens if they approve or deny it

## Required Workflow Structure

The School ROI must follow this order.

---

## Step 1 - Introduction and Explanation

### Purpose of this step

This step explains what the School ROI is, why it exists, and how it works.

### What must be shown

The introduction must clearly explain:

* this is a release of information for coordination with the selected school
* the app/system uses this release to control what school staff may receive information
* the form is school-specific and uses information already tied to the selected school
* the signer can approve or deny certain parts of the release
* the signer can approve or deny release to specific staff members
* some acknowledgements are required in order to continue
* information will be managed through the app with reasonable protections and logging

### Required design behavior

* clean opening screen
* short paragraphs, not one dense legal block
* button to continue

---

## Step 2 - Client Information Review

### Purpose of this step

This step confirms the client identity fields used for the ROI.

### What must be shown

The form should display, pulled from intake:

* Client first and last name
* Client date of birth
* Parent/guardian name if applicable

### Required design behavior

* fields shown in read-only format by default
* if data is missing, the system should allow completion or flag the missing field
* this step should clearly state that these details are being used to generate the release

---

## Step 3 - Selected School Information

### Purpose of this step

This step confirms the third party receiving the release.

### What must be shown

Auto-populated school information:

* School name
* Primary address
* Relationship to party: student
* Any relevant school contact details available in the system

### Required design behavior

* school information displayed clearly and prominently
* no manual typing required if school data already exists
* if school data is incomplete, prompt internal correction or controlled edit path

---

## Step 4 - Purpose of the Release

### Purpose of this step

This step explains exactly what ITSCO is being authorized to do.

### What must be shown

The signer must be asked to review the permitted purposes for disclosure, including:

* communication to facilitate better understanding of the client’s needs and to support development of an appropriate care plan in the school setting
* safety concerns and evaluations of harm or ideation performed in sessions
* coordinating the administration of psychological services on the third party’s property
* discussing treatment goals and associated treatment plans

### Required design behavior

* this should be displayed as a purpose section, not buried later
* should use readable bullets or cards
* must require acknowledgement before moving on

---

## Step 5 - App and Privacy Explanation

### Purpose of this step

This step explains the role of the app in the ROI and how information is managed.

### What must be shown

The signer must be informed that:

* the app/system may use the ROI to permit communication and viewing rights based on approved permissions
* only information and people authorized through this ROI should receive access within programmed limits
* disclosures and access may be logged in the system
* information is intended to be reasonably protected
* ITSCO will comply with applicable confidentiality and privacy standards

### Required design behavior

* present in simple language
* require acknowledgement
* show that this is part of how the app functions, not just background information

---

## Step 6 - Release Category Decisions

### Purpose of this step

This step collects decisions on what categories of information can be released.

### What must be shown

The form must present release categories one at a time or in clearly separated sections. Each category should have an explicit control such as:

* Allow
* Do Not Allow
* Acknowledge

### Minimum release categories to include

1. **Permission to communicate with approved school staff**
2. **Permission to share basic coordination information necessary for school-based care coordination**
3. **Permission regarding safety-related communication when clinically necessary**
4. **Permission regarding discussion of treatment goals and treatment plans as described in the form**
5. **Permission for packet or supporting documentation to be viewable if that is part of the release design**
6. **Acknowledgement that access and disclosures may be logged**

### Important rule

The system must support separate decision-making for these categories wherever intended by the workflow. It must not treat the whole ROI as one blanket yes/no if the design calls for more granular control.

---

## Step 7 - Session Content Limitation Explanation

### Purpose of this step

This step explains what is generally **not** shared.

### What must be shown

The signer must review and acknowledge that:

* information regarding the content of sessions will not be shared with listed staff unless deemed clinically necessary by the therapist for safety reasons such as imminent risk to the clinician, the client, or others, including physical harm
* confidentiality will otherwise be maintained except as stated in the ROI
* all correspondence concerning the dependent will be documented in the clinical record
* ITSCO will comply with applicable laws and regulations regarding confidential information

### Required design behavior

* this should be separated from the broader release permissions so it is easy to understand
* acknowledgement should be required

---

## Step 8 - Individual School Staff Selection

### Purpose of this step

This step allows the signer to approve or deny release to each school staff member individually.

### What must be shown

The form must display **every current school staff member associated with the selected school**.

For each staff member, show:

* full name
* role/relationship
* phone number if available
* email if available
* clear control to authorize or deny release to that person

### Required design behavior

* school staff list must be dynamic and school-specific
* every current staff member tied to that school should appear automatically
* each person must be selectable individually
* there must not be only one blanket school-level approval option
* the signer’s choices must be stored person by person

### Required system output

After this step, the system must know:

* which school staff are approved
* which school staff are denied
* whether any required minimum selection rules apply

---

## Step 9 - Packet / Document Viewing Permission

### Purpose of this step

This step determines whether the school or approved staff may view a packet or supporting documents if that feature is part of the workflow.

### What must be shown

The signer must be clearly asked whether they authorize:

* release of basic information needed for coordination
* release of packet or supporting documentation for viewing, if applicable

### Required design behavior

* this should be its own step or clearly separated subsection
* do not hide this inside a large paragraph
* response must feed actual app permissions

---

## Step 10 - Required Legal and Practical Acknowledgements

### Purpose of this step

This step contains the disclosures the signer must acknowledge before signing.

### What must be shown

The signer must acknowledge that:

* information shared by ITSCO may be subject to redistribution by the receiving party and may no longer be protected in the same way after disclosure
* the included third party is expected to protect confidentiality as applicable
* the consent may be revoked at any time
* actions already taken before revocation cannot be reversed
* revocation is initiated through [support@itsco.health](mailto:support@itsco.health) or 833-444-8726 extension 0
* the signer understands the potential consequences of disclosure and is voluntarily authorizing the release

### Required design behavior

* each acknowledgement should be clearly visible
* required acknowledgements should use required checkboxes or equivalent controls
* the signer cannot proceed to signature unless all required acknowledgements are completed

---

## Step 11 - Term of Authorization

### Purpose of this step

This step clearly states the duration of consent.

### What must be shown

* This authorization is valid for 12 months from the date signed unless revoked earlier.

### Required design behavior

* show this plainly
* store expiration date based on signature date

---

## Step 12 - Final Signature and Authorization

### Purpose of this step

This is the final execution step for the ROI.

### What must be shown

The final authorization statement should be presented with signature fields:

* signature of client or responsible party
* signature date

### Required authorization statement

The final section must communicate that the signer is authorizing release of the specified information for the purposes outlined in the consent form.

### Required design behavior

* signer must not be able to complete without signature
* date should be captured automatically when signed, or explicitly captured if required by signature workflow
* final completed record must be stored in the client file

---

## Post-Signature System Behavior

Once the ROI is signed, the system must perform the following actions.

### 1. Create the permission record

The system must generate a structured permission record including:

* client identity
* school identity
* approved staff list
* denied staff list
* approved information categories
* denied information categories
* packet/document viewing permissions
* signature date
* expiration date
* revocation status

### 2. Enforce app permissions

The app must use the signer’s decisions to control what happens next.

That means:

* only approved staff should receive access or communication privileges
* only approved information categories should be available for disclosure
* denied staff should not receive access through this ROI
* denied categories should not be disclosed through the app workflow
* packet visibility must follow the signer’s answer

### 3. Log and document activity

The system should:

* store the completed ROI in the client record
* log permission outputs
* log disclosure/access activity where the system is designed to do so
* preserve an audit trail where applicable

### 4. Support sending

The completed or active ROI workflow must be able to be:

* sent by copyable link
* sent within the system

---

## Data Fields That Must Be Stored

The ROI workflow must store at minimum:

### Client and context

* client first name
* client last name
* client date of birth
* parent/guardian name when applicable
* school ID
* school name
* school address

### Consent responses

* each release category response
* each required acknowledgement response
* each staff member approval or denial
* packet/document view permission response

### Signature and term

* signer name
* signer role
* signature timestamp or date
* effective date
* expiration date
* revocation status
* revocation date if revoked

### Metadata and tracking

* form version
* method of delivery
* generated document ID or record ID
* audit/log references if applicable

---

## Required UX / UI Principles

The form should look and behave like a guided consent tool, not a legal wall of text.

### It should be:

* school-specific
* dynamic
* interactive
* readable
* thorough
* implementation-ready
* enforceable in app logic

### It should not be:

* static only
* one giant paragraph
* one blanket approval for the entire school
* disconnected from actual permission enforcement

### Preferred presentation style

* step-by-step screens or panels
* clear section titles
* plain language explanations above legal language where possible
* obvious required vs optional decisions
* visible progress flow
* easy review before final signature

---

## Source Content That Must Be Incorporated

The following content must be preserved in substance within the new workflow.

### Client Information

Please refer to the intake questionnaire for the following details which are utilized for this document:

* First and Last Name of Client
* Client's Date of Birth
* Parent/Guardian Name

### ITSCO Authorization

I am authorizing ITSCO to:

* Speak with the third party’s staff listed below.

### Purpose of Disclosure

For the purposes of the following:

* Communication to facilitate better understanding of the client’s needs and to support the development of an appropriate care plan in the school setting.
* Safety concerns and evaluations of harm or ideation performed in sessions.
* Coordinating the administration of psychological services on the third party’s property.
* Discussing treatment goals and associated treatment plans.

### ITSCO Guidelines

I am stipulating that ITSCO must adhere to the following guidelines:

* Information regarding the content of sessions will not be shared with the staff listed unless deemed clinically necessary by the therapist for safety reasons such as imminent risk to the clinician, the client, or others including physical harm.
* Confidentiality will be maintained except for the aforementioned.
* All correspondence concerning my dependent will be documented in the clinical record.
* ITSCO will comply with all applicable laws and regulations pertaining to the handling of confidential information.

### Termination of Consent

Termination of this consent:

* This authorization is valid for 12 months from the date this authorization is signed without earlier revocation.

### Important Disclosure Statements

When disclosing information pertaining to the clinical record to a third party, please understand the following:

* Information shared by ITSCO may be subject to redistribution by the person or entity receiving it and may no longer be protected.
* The third party included in this document are bound by federal regulations to protect the confidentiality of your dependent.
* You may revoke this consent to release at any time. However, any action ITSCO has taken to fulfill this request cannot be reversed and the revocation will not affect those actions.
* This process is initiated via email or call to the support team at [support@itsco.health](mailto:support@itsco.health) or 833-444-8726 extension 0.
* I understand the potential consequences of the disclosure and voluntarily authorize this information for the purposes outlined in this consent form.

### ITSCO Representative and Contact

This document was generated by ITSCO’s authorized representative, Michael Mendez, LPC.

Questions/privacy contact:

* [michael@itsco.health](mailto:michael@itsco.health)

Primary address:

* 437 Windchime Pl. Colorado Springs, CO 80919

### Third Party Details

Third party details should auto-populate as:

* SCHOOL NAME
* PRIMARY ADDRESS

Relationship to party:

* student

---

## Acceptance Criteria

The ROI should be considered complete only if all of the following are true:

1. There is one default school ROI in the school portal workflow.
2. The form auto-populates school and intake data.
3. The form is step-by-step, not static only.
4. The signer can review and respond to each release section clearly.
5. The signer can approve or deny each current school staff member individually.
6. Required acknowledgements must be completed before signature.
7. Packet/document viewing permission is handled explicitly.
8. The system generates actual permission outputs from the signer’s responses.
9. The app limits disclosure and access based on those outputs.
10. The signed ROI is stored in the client record.
11. The form can be sent by copyable link or through the system.
12. Expiration and revocation logic are supported.

---

## Final Implementation Instruction

This School ROI must be rebuilt as a **dynamic, school-specific, implementation-ready release workflow** that drives real permissions in the app. It must not remain a generic or static document. The final build should reflect the full guided consent flow above and enforce the signer’s choices at the person level and category level.

---

## Ready-to-Use Signer Document Copy

Use this exact section as the signer-facing Smart School ROI content in the form builder. Replace bracketed placeholders with system values at runtime.

### School Release of Information (Smart ROI)

**Client Name:** [CLIENT_FULL_NAME]  
**Date of Birth:** [CLIENT_DOB]  
**Parent/Guardian:** [GUARDIAN_NAME_OR_NA]  
**School Name:** [SCHOOL_NAME]  
**School Address:** [SCHOOL_PRIMARY_ADDRESS]  
**School Contact:** [SCHOOL_CONTACT_NAME_EMAIL_PHONE_OR_NA]  
**Relationship to Party:** student  
**Generated By:** ITSCO Authorized Representative, Michael Mendez, LPC  

### 1) What this release does

This authorization allows ITSCO to coordinate with the school listed above for school-based care coordination.  
Your choices in this form control who can receive information and what information can be shared in the app.

Required acknowledgement:
- [ ] I understand this release is school-specific and my selections control staff and information access.

### 2) Client information confirmation

Please confirm the client details shown above are correct.

Required acknowledgement:
- [ ] I confirm the client and guardian information shown is correct to the best of my knowledge.

### 3) Purpose of disclosure

I authorize ITSCO to communicate with approved school staff for the following purposes:
- Communication to better understand the client’s needs and support an appropriate care plan in the school setting.
- Safety concerns and evaluations of harm or ideation performed in sessions.
- Coordinating administration of psychological services on school property.
- Discussing treatment goals and associated treatment plans.

Required acknowledgement:
- [ ] I have reviewed and acknowledge the purpose of this disclosure.

### 4) App, privacy, and documentation notice

I understand:
- Access and disclosures may be managed and logged in the app.
- Only approved staff and approved categories should receive access.
- ITSCO will reasonably protect information and follow applicable confidentiality/privacy requirements.
- Correspondence concerning my dependent will be documented in the clinical record.

Required acknowledgement:
- [ ] I acknowledge the app privacy and documentation notice.

### 5) Category-by-category release decisions

Select one response for each item.

1. **Allow communication with approved school staff**
- ( ) Allow
- ( ) Do Not Allow

2. **Allow sharing basic coordination information**
- ( ) Allow
- ( ) Do Not Allow

3. **Allow safety-related communication when clinically necessary**
- ( ) Allow
- ( ) Do Not Allow

4. **Allow discussion of treatment goals/treatment plans**
- ( ) Allow
- ( ) Do Not Allow

5. **Allow packet/supporting document view access (if applicable)**
- ( ) Allow
- ( ) Do Not Allow

Required acknowledgement:
- [ ] I understand these category selections determine disclosure permissions.

### 6) Session content limitation

I understand and acknowledge:
- Session content is not shared with listed staff unless clinically necessary for safety (for example imminent risk to clinician, client, or others, including physical harm).
- Confidentiality will otherwise be maintained except as stated in this ROI.

Required acknowledgement:
- [ ] I acknowledge the session content limitation.

### 7) Individual school staff approvals

For each current staff member listed below, select one response:
- Approve release to this person
- Deny release to this person

Display for each staff row:
- Staff name
- Role
- Phone
- Email
- Approve / Deny control

Required acknowledgement:
- [ ] I understand staff permissions are granted person-by-person.

### 8) Important legal disclosures

I understand and acknowledge:
- Information disclosed by ITSCO may be re-disclosed by the receiving person/entity and may no longer be protected in the same way after disclosure.
- Third parties included in this release are expected to protect confidentiality as applicable.
- I may revoke this consent at any time.
- Actions taken before revocation cannot be reversed.
- To revoke, contact support@itsco.health or 833-444-8726 ext. 0.
- I understand the potential consequences of disclosure and voluntarily authorize this release.

Required acknowledgements:
- [ ] I understand potential re-disclosure risk.
- [ ] I understand revocation rights and limits.
- [ ] I voluntarily authorize this release.

### 9) Term and revocation

This authorization is valid for **12 months** from the date of signature unless revoked earlier.

Required acknowledgement:
- [ ] I understand the term and revocation policy.

### 10) Final authorization and signature

I hereby authorize the release of the specified information for the purposes outlined in this consent.

**Signer Full Name:** [SIGNER_FULL_NAME]  
**Signer Relationship to Client:** [SIGNER_ROLE]  
**Signature:** [ESIGNATURE_CAPTURE]  
**Date Signed:** [SIGNED_AT]  

### 11) Internal system outputs after signature (non-signer section)

On submit, system must store and enforce:
- Approved staff IDs and denied staff IDs
- Category approvals/denials
- Packet viewing permission result
- Effective date, expiration date, and revocation status
- Audit records for permission application and ROI completion

Contact for questions/privacy concerns: michael@itsco.health  
ITSCO primary address: 437 Windchime Pl. Colorado Springs, CO 80919
