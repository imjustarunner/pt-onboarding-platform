# App Configuration: Employee Expenses, Time, and Mileage System

**System Instruction:** Create the following distinct modules based on the "Employee Expenses, Time/Session, and Mileage Claim Form." The flow is determined by the "Submission Type" selection in Module 1.

## Module 1: User Context & Routing
**Description:** Collects user identity, tier level, and determines the workflow path.
* **Email Collection:** (Auto-capture or Input)
* [cite_start]**Current Tier Level:** (Single Select) [cite: 9]
    * [cite_start]*Note to System:* Display tooltip: "Found in Payroll/Office Scheduling folder. Tiers determine mileage reimbursement rates." [cite: 10-12]
    * [cite_start]*Option 1:* Tier 1 [cite: 15]
    * [cite_start]*Option 2:* Tier 2 [cite: 16]
    * [cite_start]*Option 3:* Tier 3 [cite: 17]
    * [cite_start]*Option 4:* Unknown/Other/Not Applicable [cite: 18]
* [cite_start]**Organization Selection:** (Single Select) [cite: 21]
    * [cite_start]*Option 1:* ITSCO [cite: 23]
    * [cite_start]*Option 2:* NextLevelUp [cite: 24]
    * [cite_start]*Option 3:* InnerStrengthInstitute [cite: 25]
    * [cite_start]*Option 4:* PlotTwistCo [cite: 26]
* [cite_start]**Submission Type (Routing Logic):** (Single Select) [cite: 28]
    * [cite_start]*Option A:* Reimbursement -> **Go to Module 2** [cite: 29]
    * [cite_start]*Option B:* Expense Tracking -> **Go to Module 2** [cite: 30]
    * [cite_start]*Option C:* Attendance, Holiday Time, Additional Time / Service Correction Claim -> **Go to Module 3** [cite: 31]
    * [cite_start]*Option D:* In-School Claim (Mileage or Missed Medicaid Session) -> **Go to Module 4** [cite: 34]
    * [cite_start]*Option E:* Milestones/Achievements -> **Go to Module 5A** [cite: 49]
    * [cite_start]*Option F:* PTO Request -> **Go to Module 5B** [cite: 38]
    * [cite_start]*Option G:* Training Hour Tracking -> **Go to Module 5C** [cite: 40]

---

## Module 2: Financials (Reimbursement & Expenses)
**Description:** Handles both out-of-pocket reimbursements and company card expense tracking.
**Logic:** If "Reimbursement" was selected, require "Supervisor/Approver" and "Pre-approved" fields. If "Expense Tracking" was selected, require "Administrative Purpose."

### Section A: Context
* [cite_start]**Administrative Purpose (Expense Tracking Only):** (Single Select) [cite: 69]
    * [cite_start]*Options:* Office supplies, Client reward/award, School visit, Outreach / community event, Staff appreciation event, Training / conference, Printing / postage, Technology / software / subscriptions, Facilities / maintenance / utilities, Travel (non-mileage), Other. [cite: 73-83]
* [cite_start]**Reason for Reimbursement (Reimbursement Only):** (Text Required) [cite: 53]
* **Was this expense pre-approved? (Reimbursement Only)[cite_start]:** (Yes/No) [cite: 55]
* [cite_start]**Supervisor/Approver Name:** (Text - Name or Email) [cite: 60]
* [cite_start]**Cost Center / Client / School:** (Text Optional) [cite: 85]

### Section B: Transaction Details
* [cite_start]**Expense Date:** (Date Picker) [cite: 88]
* [cite_start]**Merchant / Vendor:** (Text) [cite: 91]
* [cite_start]**Category:** (Single Select) [cite: 92]
    * *System Logic:* If "Mileage (approved only)" is selected, expand **Section C**. For all other categories, skip to **Section D**.
    * [cite_start]*Options:* Mileage (approved only), Staff appreciation event, Office supplies, Client reward/award, School visit, Outreach / community, Training / conference, Printing / postage, Technology / software, Facilities / maintenance, Travel (non-mileage), Meals, Fees, Other. [cite: 96-109]

### Section C: Mileage Logic (Conditional)
* [cite_start]**Date of drive:** (Date Picker) [cite: 113]
* [cite_start]**Miles driven:** (Number - allow decimals, e.g., 12.6) [cite: 116-117]
* [cite_start]**Start location:** (Address or description) [cite: 118]
* [cite_start]**End location:** (Address or description) [cite: 120]
* [cite_start]**Round trip?** (Yes/No) [cite: 122]

### Section D: Payment & Proof
* [cite_start]**Amount:** (Currency Input - Numbers only) [cite: 128]
* [cite_start]**Payment Method:** (Single Select) [cite: 131]
    * [cite_start]*Options:* Company Card, Personal Card, Cash, ACH / Wire, Other. [cite: 133-137]
* [cite_start]**Split Category Details:** (Text Area - "Does this expense need to be divided into multiple categories? If so, please detail below") [cite: 142]
* [cite_start]**Who Paid?** (Single Select) [cite: 144]
    * [cite_start]*Options:* I paid personally (reimbursement), Company paid (tracking). [cite: 146-147]
* [cite_start]**Project / School / Client:** (Text Optional) [cite: 148]
* [cite_start]**Notes:** (Text Optional) [cite: 149]
* [cite_start]**Receipts:** (File Upload) [cite: 151]
* [cite_start]**Attestation:** (Checkbox) "I certify this expense is accurate, necessary for work, and I have not submitted it elsewhere." [cite: 63]

---

## Module 3: Attendance, Time & Service Corrections
**Description:** Logs meetings, excess fee-for-service time, holiday pay, and service corrections.
[cite_start]**Sub-Menu:** Select the specific claim type: [cite: 167]

### Sub-Module 3A: Log Attendance for Meeting or Training
* [cite_start]**Date of Meeting or Training:** (Date Picker) [cite: 172]
* [cite_start]**Meeting Type:** (Single Select) [cite: 174]
    * [cite_start]*Options:* Admin Update Meeting, Admin Meeting, Leadership Circle Meeting, Admin Town Hall Meeting, Training, Evaluation, Not listed. [cite: 176-182]
* [cite_start]**Other meeting not listed:** (Text) [cite: 184]
* **Time Log:**
    * [cite_start]Start Time [cite: 186]
    * [cite_start]End Time [cite: 190]
    * [cite_start]Total Minutes [cite: 194]
* [cite_start]**Platform:** (Single Select) [cite: 195]
    * [cite_start]*Options:* Google Meet, In-Person, Other. [cite: 197-199]
* [cite_start]**Event summary:** (Text Area - include purpose) [cite: 201]
* [cite_start]**Attestation:** (Checkbox) "I certify that the information is accurate, complete, and in compliance with the policies in the workplace handbook" [cite: 205]

### Sub-Module 3B: Excess or Holiday Time Submission
* [cite_start]**Context:** For Fee-For-Service only. [cite: 208]
* [cite_start]**Date of Services:** (Date Picker) [cite: 219]
* **Time Breakdown:**
    * [cite_start]Total Direct Time (Minutes - Must match EHR) [cite: 221]
    * [cite_start]Total Indirect Time (Minutes) [cite: 223]
* [cite_start]**Reason for extended time/s:** (Text Area - List all service codes included, e.g., 4 x 90837) [cite: 225]
* [cite_start]**PTO-Only for this claim?** (Single Select) [cite: 228]
    * [cite_start]*Options:* Yes, No, Unknown. [cite: 233-235]
* [cite_start]**Total time worked for PTO consideration?** (Text/Number) [cite: 236]
* [cite_start]**Attestation:** (Checkbox - Standard Text) [cite: 240]
* [cite_start]**Request Overtime Evaluation for this Day?** (Yes/No) -> *If Yes, trigger Overtime Logic below.* [cite: 243]

### Sub-Module 3C: Submit Service Correction
* [cite_start]**Date of Service:** (Date Picker) [cite: 249]
* [cite_start]**Client Initials:** (Text - First 3 of first/last name) [cite: 252]
* **Correction Details:**
    * [cite_start]Original Service Submitted [cite: 254]
    * [cite_start]Corrected Service [cite: 256]
    * [cite_start]Duration for Corrected Service [cite: 257]
* [cite_start]**Reason for correction:** (Text Area) [cite: 259]
* [cite_start]**Attestation:** (Checkbox - Standard Text) [cite: 263]

### Sub-Module 3D: Overtime Evaluation (Triggered)
* [cite_start]**Did you work over 12 hours in a day?** (Yes/No) [cite: 267]
* [cite_start]**List the dates with 12+ hours and total hours each day:** (Text) [cite: 272]
* [cite_start]**Estimated total work hours this workweek:** (Number) [cite: 274]
* [cite_start]**All direct service recorded in the EHR?** (Yes/No) [cite: 279]
* [cite_start]**Was this overtime approved?** (Yes/No) [cite: 283]
* [cite_start]**Who approved this overtime?** (Text) [cite: 287]
* [cite_start]**Notes for payroll:** (Text) [cite: 288]
* [cite_start]**Attestation:** (Checkbox - Standard Text) [cite: 291]

---

## Module 4: In-School Provider Claims
[cite_start]**Description:** Specialized logic for school-based providers. [cite: 293]
[cite_start]**Sub-Menu:** Select Claim Type: "Missed Session for Medicaid clients" OR "Travel to School Mileage". [cite: 311-312]

### Sub-Module 4A: Missed Session for Medicaid Clients
* [cite_start]**System Directive:** Allow user to add up to 4 entries dynamically. [cite: 390]
* **Entry Fields:**
    * [cite_start]**Date of Scheduled Session:** (Date Picker) [cite: 328]
    * [cite_start]**Client Initials:** (Text) [cite: 331]
    * [cite_start]**Client has Medicaid Insurance:** (Yes/No) *Logic: Must be YES to proceed.* [cite: 332]
    * [cite_start]**Service Code:** (Single Select) [cite: 342]
        * [cite_start]*Options:* 90832, 90834, 90837. [cite: 346-348]
    * [cite_start]**Reason for Missed Session:** (Single Select) [cite: 349]
        * [cite_start]*Options:* Snow Day/School Cancellation, Late Start, Client No-Show due to Attendance. [cite: 352-354]
    * [cite_start]**Attempts to Replace Session:** (Multi-Select Checkbox) [cite: 357]
        * [cite_start]*Options:* Attempted Virtual Session, Attempted H0032 (if applicable with Parent/Guardian Contact), Attempted Reschedule Later in Week, Attempted Additional Acquisition of Information from school counselor as appropriate (H0031), Attempted to reengage client in services (H0023), Other. [cite: 360-366]
    * [cite_start]**Missed Session Note Completed in EHR?** (Yes/No) [cite: 367]
    * [cite_start]**Charge-Fee Box Checked?** (Yes/No) *Logic: Must be NO.* [cite: 372]
    * [cite_start]**Additional Comments:** (Text) [cite: 377]
    * [cite_start]**Certification:** (Checkbox) "I certify that this missed session claim is accurate..." [cite: 381]

### Sub-Module 4B: Travel to School Mileage (Tier 2/3 Only)
* **System Directive:** Calculation Rule: (Home ↔ School Roundtrip) – (Home ↔ Office Roundtrip). [cite_start]Allow up to 4 entries. [cite: 593-594]
* **Entry Fields:**
    * [cite_start]**Date:** (Date Picker) [cite: 607]
    * **Locations:**
        * [cite_start]Home Address [cite: 610]
        * [cite_start]School Name [cite: 611]
        * [cite_start]School Address [cite: 613]
        * [cite_start]Assigned Office: (Single Select) [cite: 615]
            * [cite_start]*Options:* Colorado Springs Office (437 Windchime), Denver Office (7010 Broadway). [cite: 617-618]
    * **Distances (Google Maps Shortest Trip):**
        * [cite_start]Round Trip Distance from your Home to School [cite: 620]
        * [cite_start]Round Trip Distance from your Home to Office [cite: 624]
    * **Mileage Difference:** (Auto-calc: School Trip - Office Trip). [cite_start]*Note: If negative, result is 0 (Not eligible).* [cite: 628]
* [cite_start]**Notes:** (Text Optional) [cite: 634]
* [cite_start]**Attestation:** (Checkbox) "I certify the information is accurate." [cite: 636]

---

## Module 5: HR & Professional Development
**Description:** Milestones, PTO, and Training Logs.

### Sub-Module 5A: Milestones and Achievements
* [cite_start]**I completed the following:** (Single Select) [cite: 810]
    * [cite_start]*Options:* 100 total hours of supervision, Client termination due to achieving treatment goals. [cite: 812-813]
* [cite_start]**If client termination:** "Please enter client initials and great work!" [cite: 815]

### Sub-Module 5B: PTO Request
* [cite_start]**System Directive:** Allow multiple entries (Date/Hours pairs). [cite: 820-837]
* **Entry Fields:**
    * [cite_start]Date of PTO Request [cite: 820]
    * [cite_start]Number of hours requested [cite: 823]

### Sub-Module 5C: Training Hour Tracking
* [cite_start]**System Directive:** Allow multiple entries (Date/Hours/Reason sets). [cite: 842-860]
* **Entry Fields:**
    * [cite_start]Date of Training Hours [cite: 842]
    * [cite_start]Number of Hours [cite: 845]
    * [cite_start]Reason for Training Hours [cite: 847]