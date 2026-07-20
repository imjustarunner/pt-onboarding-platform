# Admin Dashboard Redesign & Integration Plan
## Ops Hub for Admin & Support

---

## 1. Objective

Transform the tile-based / analytics-leaning admin dashboard into a **quick-access operations hub** for `admin` and `support` roles.

Analytics and trend sparklines are **not** the primary job of this surface. The dashboard exists so staff can see what needs attention and jump straight into work.

The ops dashboard (`TenantAdminDashboard.vue`) is the **default** tenant admin landing at `/:organizationSlug/admin` (and `/admin` when a tenant is selected). Classic remains available via `?classic=1` or “View classic dashboard”.

---

## 2. Core Philosophy

### Target state
- At-a-glance priority counts (tickets, messages, late notes, applications, payroll)
- Documentation alerts with deep links
- **Customizable Quick Actions** (including report shortcuts)
- Toggleable summary sections (Communications, Clients, People Ops, System Alerts, Schedule)
- Sidebar grouped for ops navigation (CORE / CLIENTS / PEOPLE OPS / OPERATIONS / REPORTS / SYSTEM)

### Also included
- Brand-dark green sidebar (from tenant primary color)
- School Updates & Changes card (tenants with school portals)
- Events and Programs summary cards
- Reordered Quick Actions (`context-key="tenant-ops-v2"`)

### Explicitly deferred
- **Priority Activity Feed** — not part of the current ops layout
- Widget drag-and-drop / server-synced layout

---

## 3. Layout

```
Header: Management Dashboard + datetime + Customize Dashboard
↓
At a Glance (metric cards with CTAs)
↓
Documentation Alerts | Quick Actions grid
↓
Communications | Client Quick Access | People Ops | System Alerts | Today's Schedule
```

### Customize Dashboard
1. **Section visibility** — localStorage key `adminDashboardSections:tenant:{userId}`
2. **Quick Actions selection** — existing `QuickActionsSection` with `context-key="tenant-ops"` (separate from classic `agency`)

Defaults for Quick Actions: Create Ticket, Send Message, Add Progress Note, Schedule Appointment, Review Applications, Run Reports. Catalog also includes Payroll Reports, Communications Center, Unassigned Documents, Clients, Users, Payroll Pending, Notifications.

---

## 4. Data sources (composed on the frontend)

| Metric / panel | API |
|----------------|-----|
| Tickets / delivery queue | `GET /communications/center-summary`, `GET /support-tickets/count`, `GET /support-tickets/metrics` |
| Messages | `GET /messages/dashboard-summary` |
| Agency / people counts | `GET /dashboard/agency-specs` |
| Schedule | `GET /dashboard/schedule-snapshot` |
| Unassigned docs | `GET /unassigned-documents` |
| Hiring applications | `GET /hiring/candidates` |
| Payroll submissions | `GET /payroll/pending-submissions-summary` |
| Late / unsigned notes | Notification types + titles from notifications store |
| Recent clients | `GET /clients?limit=5` |

Visual language follows Communications Center KPI/alert patterns and agency brand greens.

---

## 5. Key files

| Path | Role |
|------|------|
| `frontend/src/views/admin/TenantAdminDashboard.vue` | Beta ops dashboard |
| `frontend/src/composables/useAdminDashboardPrefs.js` | Section toggle prefs |
| `frontend/src/components/admin/opsDashboard/*` | At a Glance, Docs Alerts, summary cards |
| `frontend/src/components/admin/QuickActionsSection.vue` | Customizable action grid (`openCustomizer` exposed) |
| `frontend/src/views/admin/AgencyAdminDashboard.vue` | Classic fallback |

---

## 6. Preserve existing features

All classic modules remain reachable via sidebar, Quick Actions catalog, and deep links from metric cards. Classic dashboard stays at `/:organizationSlug/admin`.

---

## 7. Out of scope (this pass)

- Priority Activity Feed
- Full layout rearrange / server persistence
- Plot Twist HQ / superadmin platform dashboard changes
- New report engines or dedicated ops-summary backend aggregation
