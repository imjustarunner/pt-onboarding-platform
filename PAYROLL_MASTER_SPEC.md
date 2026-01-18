# Payroll System Master Specification
**Version:** 1.0
**Goal:** Create a web-based "Source of Truth" for payroll that ingests billing reports, calculates complex tiered compensation, allows manual overrides, and tracks history.

---

## 1. System Architecture & Workflow

### A. The Core Workflow
1.  **Upload:** Payroll Manager uploads the Billing Report (CSV/XLSX) for a specific Pay Period (e.g., "12/05/2025").
2.  **Processing:** System sanitizes data, applies "Missed Appointment" logic, and aggregates units.
3.  **Editable Staging (The Workspace):**
    * System displays the calculated counts: `No Note`, `Draft`, `Finalized`.
    * **Requirement:** Admin can manually edit these counts (e.g., move 5 units from "Draft" to "No Note" based on EHR research).
    * *This edited state becomes the "Final State" for calculations.*
4.  **Calculation Engine:** System runs the Tier Logic, Rate Logic (Direct/Indirect), and Add-ons.
5.  **Finalization:** Admin hits "Submit".
    * Data is locked.
    * Timestamp/User recorded in `Payroll History`.
    * Dashboards update immediately.

### B. Database Schema Requirements
* **Users:** `id`, `name` (Identity Resolution required), `current_tier_level`, `prior_tier_level`.
* **Pay_Periods:** `id`, `start_date`, `end_date`, `status` (Draft/Finalized).
* **Payroll_Records:** Linked to User + Pay Period. Stores `direct_hours`, `indirect_hours`, `tier_credits`, `gross_pay`.
* **Line_Items:** Stores specific add-ons (Mileage, PTO, Bonus) linked to a Payroll Record.

---

## 2. The Logic Engines

### Engine A: Ingestion & Staging
**Input:** Raw Billing CSV.
**Rules:**
1.  **Identity Resolution:** Match CSV Name to Database User. If duplicate names exist (e.g., "Jane Doe" vs "Jane Doe "), map to single User ID.
2.  **Sanitization:**
    * If `Units` is empty/zero, default to `1.0`.
    * If `Status` is empty, default to `NO NOTE`.
3.  **Missed Appt Override:**
    * IF `Appt Type`="Missed Appointment" AND `Amount`>0 AND `Paid Status`="Paid in Full":
    * Set Code="Missed Appt", Units=(Amount * 0.5), Status="Finalized".
4.  **Display:** Show table of aggregated units. **Allow inline editing.**

### Engine B: The Tier & Compensation Calculator
*This runs ONLY after Staging is approved/edited.*

**1. Tier Logic (The "Grace Period")**
* **Step 1:** Calculate `Current Tier Credits` (Sum of eligible Finalized Units).
* **Step 2:** Fetch `Prior Pay Period Tier Credits` from database.
* **Step 3:** Determine `Final Tier Level`:
    * IF `Current` >= `Prior`: Use **Current** (Level Up or Maintain).
    * IF `Current` < `Prior`: Use **Prior** (Grace Period Logic).

**2. Rate Assignment (Multi-Rate Structure)**
Every user has a profile with multiple potential rates:
* **Rate 1 (Direct):** Applied to Direct Clinical Hours (e.g., 90837, 90834).
* **Rate 2 (Indirect):** Applied to Indirect/Admin Hours (e.g., Meetings, Training).
* **Rate 3+ (Other):** Special service codes.

**3. Hours & Pay Calculation**
* `Direct Hours` = Sum of Direct Service Codes.
* `Indirect Hours` = Sum of Indirect Service Codes.
* **Formula:**
    * (`Direct Hours` * `Rate 1`)
    * + (`Indirect Hours` * `Rate 2`)
    * + (`Other Hours` * `Rate 3`)
    * = **Base Pay**.

### Engine C: Adjustments & Add-ons
*Must be editable per Pay Period.*
The interface must provide input fields for:
* **Mileage:** (Input $ Amount)
* **Bonuses:** (Holiday, System, Performance)
* **Reimbursements:** (Taxable/Non-Taxable flags)
* **PTO:** (Input Hours -> Auto-calculate based on PTO Rate)
* **Salary:** (Override Base Pay if applicable)

---

## 3. Migration Strategy (The "Seeder")
**Goal:** Auto-configure the system from the legacy `Master_Ledger.csv`.

1.  **Upload Master Ledger.**
2.  **Create Users:** Unique names become User Profiles.
3.  **Infer Rates:**
    * Analyze historical rows.
    * If Jane was paid $50 for 90837, create `Rate 1 = $50` for Jane.
    * If Jane was paid $25 for Admin, create `Rate 2 = $25` for Jane.
4.  **Result:** System is pre-populated with all staff, their tiers, and their custom rate cards.

---

## 4. Reports & Access Control

### A. Admin View (Payroll Manager)
* **History Tab:** List of all finalized runs with Timestamps ("Ran by Sarah on 12/20/25 at 2:00 PM").
* **Edit Access:** Can unlock a "Finalized" period to make corrections (audit log required).
* **ADP Export:** Generates CSV mapping `User ID` -> `Total Gross Pay` + `Separate Bonus Columns`.

### B. Dashboard View (The Output)
* **Tier Status:** Display "Current Level" and "Grace Period Active" (if applicable).
* **Pay Breakdown:**
    * Direct: X Hours @ $Y = $Total
    * Indirect: X Hours @ $Y = $Total
    * Add-ons: Mileage, Bonus, etc.
* **Missing Items:** Display counts of "No Note" and "Draft" (calculated from the *edited* staging area).