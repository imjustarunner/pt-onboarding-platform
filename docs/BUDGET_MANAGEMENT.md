# Budget Management System

## Overview

Budget Management is a feature-gated expense and budget tracking system for agencies. When enabled via the agency's feature flags, it provides:

- **Total operating budget** set at fiscal year start
- **Department allocations** (Scholarships, Communications, Development, O&O, etc.)
- **Expense submission** with receipt OCR, mileage calculation, and structured categorization
- **Roles**: `assistant_admin` (department-scoped, customizable) and `provider_plus` (department-scoped, limited)
- **Departments** as a new classification (separate from schools/organizations)

## Architecture

```
Agency
├── Total Operating Budget (fiscal year)
├── Departments (Scholarships, Communications, Development, O&O, etc.)
│   ├── Budget allocation per fiscal year
│   └── Department accounts (e.g. 01-61502-01: O.O. Staff Training & Development)
├── Agency-level expense categories (Travel, Meals, Hotel, Mileage, etc.)
├── Business purposes (shared, linked to events)
└── Events (sub-organizations, e.g. DEI Alliance Meeting, East Coast Selection)

Expenses → Department, Account, Category, Business Purpose, Place
```

## Feature Toggle

- **Platform-level**: SuperAdmin controls which agency feature toggles are visible (Platform Settings → Available Agency Features). When a feature is unchecked, agencies cannot see that toggle.
- **Agency feature flag**: `budgetManagementEnabled` (in `feature_flags` JSON)
- **Management dropdown**: "Budget Management" link visible when enabled and user has `canAccessBudgetManagement`
- **Settings**: Enable under Agency Management → Features tab (only shown if platform has made it available)

## Permissions

### Platform-Level Available Features
- **Storage**: `platform_branding.available_agency_features_json` (migration 503)
- **SuperAdmin UI**: Platform Settings → Available Agency Features (checkboxes for Budget Management, Payroll, Hiring, Note Aid, etc.)
- **Agency UI**: Company Profile → Features tab shows only toggles for features the platform has made available

### assistant_admin Granular Permissions
- **Storage**: `user_agencies.assistant_admin_permissions_json` (per agency)
- **UI**: User Profile → Departments tab (when role is Assistant Admin, per-agency checkboxes)
- **Permissions**: `canManageBudgetAllocation`, `canManageBudgetSettings`, `canApproveExpenses`, `canViewReports`
- **Backend**: Budget controller enforces these on fiscal years, allocations, categories, accounts, purposes, events, export, and AI analysis

## Implementation Phases

### Phase 1: Feature Toggle and Foundation ✅
- `budgetManagementEnabled` in agency feature flags
- "Budget Management" link in Management dropdown
- Placeholder route `/:organizationSlug/admin/budget-management`
- Backend `isBudgetManagementEnabled()` helper

### Phase 2: Departments ✅
- **Tables**: `agency_departments`, `user_department_assignments`, `user_agencies.has_department_access`
- **Settings**: Departments under Workflow (Settings → Departments)
- **User Profile**: Departments tab for department access and assignments
- **APIs**: `GET/POST/PUT/DELETE /api/agencies/:id/departments`, `PUT/GET /api/users/:id/department-access`

### Phase 3: Roles ✅
- **assistant_admin**: New role between admin and staff; customizable permissions per department
- **provider_plus**: Department-scoped permissions
- **Auth payload**: `departmentAgencyIds`, `canAccessBudgetManagement`
- **Access**: Budget Management gated by `canManagePayroll` OR `canAccessBudgetManagement`

### Phase 4: Budget Allocation ✅
- **Tables**: `agency_fiscal_years`, `department_budget_allocations`
- **Fiscal year**: Jul 1 – Jun 30 (configurable)
- **UI**: Fiscal year section, Department Allocations table with validation (sum ≤ total)
- **APIs**: `GET/POST/PUT /api/budget/agencies/:id/fiscal-years`, `GET/PUT /api/budget/fiscal-years/:id/allocations`

### Phase 5: Categories, Accounts, Business Purposes ✅
- **Tables**: `agency_expense_categories`, `department_accounts`, `agency_business_purposes`, `budget_events`
- **Expense categories**: Travel, Meals, Hotel, Other Transportation, Mileage (agency-level)
- **Department accounts**: Account number + label per department
- **Business purposes**: Agency-level, linked to events
- **APIs**: Full CRUD for all entities

### Phase 6: Submit Expenses and Receipt OCR ✅
- **Table**: `budget_expenses`
- **Receipt OCR**: `receiptOcr.service.js` using Google Vision (images) and pdf-parse (PDFs)
- **Large modal**: Multiple expense rows, receipt upload → OCR prefill
- **Dropdowns**: Department → Account → Expense Category → Business Purpose → Place
- **APIs**: `POST /api/budget/expenses/ocr`, `POST /api/budget/agencies/:id/expenses`
- **Entry points**: Dashboard "Submit Budget Expenses" card, Budget Management "Submit Expenses" button

### Phase 7: Mileage ✅
- **Service**: `getMultiLegDistanceMeters(legs[])`, `getRoundTripDistanceMeters(origin, dest)` in `googleDistance.service.js`
- **API**: `GET /api/budget/mileage/calculate?origin=...&destinations=...&roundTrip=`
- **UI**: Mileage expense type in submit modal (start, destinations, round trip, Calculate)
- **Storage**: `mileage_legs_json` in `budget_expenses` for audit

### Phase 8: Expense Search, Reports, AI ✅
- **APIs**: `GET /api/budget/agencies/:id/expenses` (filters, search), `GET .../expenses/export.csv`, `POST .../expenses/analyze`
- **UI**: Expenses tab with filters, CSV export, AI Insights button
- **AI**: Gemini-powered suggestions for cost reduction

### Phase 9: Department Interface ✅
- **Department switcher**: Cards for assistant_admin/provider_plus to scope view
- **API**: `GET /api/budget/agencies/:id/my-departments`
- **Department settings**: `settings_json` editable in Settings → Departments

### Phase 10: Events as Sub-Organizations ✅
- **Event portal**: `settings.portalEnabled` on budget_events
- **APIs**: `GET /api/budget/agencies/:id/events/by-slug/:slug`, `GET .../events/:eventId/expenses`
- **Route**: `/:organizationSlug/event/:eventSlug` (BudgetEventPortalView)
- **UI**: Portal toggle in Events tab, "View portal" link

## Key Files

| Area | Path |
|------|------|
| Feature flag | `AgencyManagement.vue` (Features tab) |
| Management link | `App.vue` (canSeeBudgetManagement) |
| Budget Management view | `frontend/src/views/admin/BudgetManagementView.vue` |
| Submit modal | `frontend/src/components/budget/BudgetSubmitExpensesModal.vue` |
| Event portal | `frontend/src/views/budget/BudgetEventPortalView.vue` |
| Budget controller | `backend/src/controllers/budget.controller.js` |
| Budget routes | `backend/src/routes/budget.routes.js` |
| Receipt OCR | `backend/src/services/receiptOcr.service.js` |
| Mileage | `backend/src/services/googleDistance.service.js` |

## Migrations (run in order)

1. `497_agency_departments.sql`
2. `498_user_department_access.sql`
3. `499_add_assistant_admin_role.sql`
4. `500_agency_fiscal_years.sql`
5. `501_budget_events_and_categories.sql`
6. `502_budget_expenses.sql`

## Known Considerations

1. **provider_plus access**: `provider_plus` with department access (`has_department_access` + `user_department_assignments`) receives `canAccessBudgetManagement` and can submit expenses, view their department's budget, and use the Budget Management interface (scoped to their assigned departments).

2. **Fiscal year**: Default Jul 1 – Jun 30; configurable per agency is not yet implemented.

3. **Event portal**: Requires `canAccessBudgetManagement`; consider whether provider_plus with event access should have read-only portal access.
