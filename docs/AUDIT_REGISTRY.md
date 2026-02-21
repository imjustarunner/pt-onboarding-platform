# Audit Action Registry

**Last updated:** 2025-02-21

This document is the source of truth for Audit Center categories and actions. All audit actions use **plain English labels** and are **categorized** for easy filtering and evaluation.

---

## Overview: Exhaustive Audit System

The platform maintains an **agency-scoped, immutable audit trail** across these sources:

| Source | What it captures |
|--------|------------------|
| **User activity** | Logins, logouts, module progress, dashboard views, page views |
| **Admin actions** | User management, clinical record changes, billing, office events |
| **Client access** | Client records viewed, notes created, status changes |
| **PHI documents** | Document uploads, downloads, views, exports, removals |
| **Support tickets** | Ticket creation and messages |
| **Task audit** | Task assignments, completions, overrides, due date changes |
| **Task deletion** | Tasks deleted by users or admins |

**Audit Center** (`/admin/audit-center`) provides:
- Filter by **agency**, **source**, **category**, **action type**, **user**, **date range**
- Search across user names, client initials, action text, metadata, IP, session
- Export to CSV
- Grouped view by category
- Deep links to users, clients, documents, support tickets

All actions are mapped to **plain English labels** (e.g. `user_archived` → "User archived") and **categories** (e.g. Staff, Documents, Tasks) for consistent display and filtering.

---

## How to Use This File

### To add or update actions later

Say something like:
- *"Update the audit registry with any new actions from the codebase"*
- *"Add `new_action_type` to the Documents category with label 'New action description'"*
- *"Create a new category 'Telehealth' and add these actions: ..."*
- *"Sync AUDIT_REGISTRY.md with the codebase and update the registry files"*

### Reference by date

When asking for updates, you can say:
- *"As of [today's date], add any new audit actions to the registry"*
- *"Review the codebase for new `actionType` / `action_type` / `logActivity` / `logAuditEvent` calls and add them to AUDIT_REGISTRY.md and the registry"*

---

## Categories (in display order)

| Category | Description |
|----------|-------------|
| Authentication | Logins, logouts, password changes, session timeouts |
| Staff | User profiles, roles, agency assignments, payroll access |
| Training | Training modules, tracks, intake approvals |
| Documents | Clinical notes, paperwork, admin docs, uploads, legal holds |
| Client Access | Client records viewed, notes created, client updates |
| School Portal | School roster, comments, waitlist |
| Communications | SMS, calls, voicemail |
| Support | Support tickets and messages |
| Billing & Payroll | Payroll data, billing policies |
| Office & Scheduling | Office events, scheduling changes |
| AI & Tools | Note Aid, Focus Assistant |
| Tasks | Task assignments, completions, overrides |
| Page Views | Dashboard, Audit Center, admin dashboard, and admin page views |
| Other | Unregistered or uncategorized actions |

---

## Actions by Category

### Authentication
| action_type | label |
|-------------|-------|
| login | User logged in |
| logout | User logged out |
| timeout | Session timed out |
| password_change | Password changed |
| password_reset_link_sent | Password reset link sent |

### Staff
| action_type | label |
|-------------|-------|
| grant_payroll_access | Payroll access granted |
| revoke_payroll_access | Payroll access revoked |
| user_profile_updated | User profile updated |
| user_archived | User archived |
| user_restored | User restored from archive |
| user_status_changed | User status changed |
| user_assigned_to_agency | User assigned to agency |
| user_removed_from_agency | User removed from agency |
| supervisor_privileges_toggled | Supervisor access updated |
| user_marked_complete | User marked onboarding complete |
| user_marked_terminated | User marked as terminated |
| user_deactivated | User deactivated |

### Training
| action_type | label |
|-------------|-------|
| module_start | Training module started |
| module_end | Training module ended |
| module_complete | Training module completed |
| reset_module | Module reset by admin |
| reset_track | Track reset by admin |
| mark_module_complete | Module marked complete by admin |
| mark_track_complete | Track marked complete by admin |
| intake_approval | Intake application approved |

### Documents

**Clinical notes, claims, and documents**
| action_type | label |
|-------------|-------|
| clinical_session_started | Clinical session started |
| clinical_note_created | Clinical note created |
| clinical_claim_created | Clinical claim created |
| clinical_document_created | Clinical document created |
| clinical_artifacts_viewed | Clinical notes, claims, or documents viewed |
| clinical_note_deleted | Clinical note deleted |
| clinical_note_restored | Clinical note restored |
| clinical_note_legal_hold_set | Legal hold placed on clinical note |
| clinical_note_legal_hold_released | Legal hold removed from clinical note |
| clinical_claim_deleted | Clinical claim deleted |
| clinical_claim_restored | Clinical claim restored |
| clinical_claim_legal_hold_set | Legal hold placed on clinical claim |
| clinical_claim_legal_hold_released | Legal hold removed from clinical claim |
| clinical_document_deleted | Clinical document deleted |
| clinical_document_restored | Clinical document restored |
| clinical_document_legal_hold_set | Legal hold placed on clinical document |
| clinical_document_legal_hold_released | Legal hold removed from clinical document |

**Checklists and paperwork**
| action_type | label |
|-------------|-------|
| document_status_updated | Paperwork marked received |
| compliance_checklist_updated | Onboarding checklist updated |

**Admin documents**
| action_type | label |
|-------------|-------|
| admin_doc_deleted | Admin document deleted |
| admin_doc_restored | Admin document restored |
| admin_doc_legal_hold_set | Legal hold placed on document |
| admin_doc_legal_hold_released | Legal hold removed from document |

**General document actions**
| action_type | label |
|-------------|-------|
| uploaded | Document uploaded |
| downloaded | Document downloaded |
| view | Document viewed |
| exported_to_ehr | Document exported to EHR |
| removed | Document removed |

### Client Access
| action_type | label |
|-------------|-------|
| view_client | Client record viewed |
| view_client_restricted | Client record viewed with restrictions |
| view_client_notes | Client notes viewed |
| create_client_note | Client note created |
| client_created | Client created |
| client_updated | Client updated |
| client_status_changed | Client status changed |
| client_admin_note_updated | Client admin note updated |

### School Portal
| action_type | label |
|-------------|-------|
| school_portal_roster_viewed | School portal roster viewed |
| school_portal_comments_viewed | School portal comments viewed |
| school_portal_comment_posted | School portal comment posted |
| school_portal_waitlist_viewed | School waitlist viewed |
| school_portal_waitlist_updated | School waitlist updated |

### Communications
| action_type | label |
|-------------|-------|
| sms_sent | SMS message sent |
| sms_send_failed | SMS send failed |
| sms_inbound_received | Inbound SMS received |
| sms_opt_in | SMS opt in |
| sms_opt_out | SMS opt out |
| sms_thread_deleted | SMS thread deleted |
| sms_message_deleted | SMS message deleted |
| outbound_call_started | Outbound call started |
| outbound_call_failed | Outbound call failed |
| voicemail_listened | Voicemail listened to |

### Support
| action_type | label |
|-------------|-------|
| support_ticket_created | Support ticket created |
| support_ticket_message | Support ticket message sent |

### Billing & Payroll
| action_type | label |
|-------------|-------|
| payroll_write | Payroll data entered or updated |
| BILLING_POLICY_PROFILE_PUBLISHED | Billing policy profile published |
| BILLING_POLICY_RULE_UPSERTED | Billing rule updated |
| BILLING_POLICY_ACTIVATED | Billing policy activated |
| BILLING_POLICY_SERVICE_CODE_ACTIVATION_UPDATED | Billing service code activation updated |
| BILLING_POLICY_INGESTION_UPLOADED | Billing policy data uploaded |
| BILLING_POLICY_CANDIDATE_REVIEWED | Billing policy candidate reviewed |
| BILLING_POLICY_RULES_PUBLISHED | Billing rules published |

### Office & Scheduling
| action_type | label |
|-------------|-------|
| OFFICE_EVENT_DELETE_REQUESTED | Office event delete requested |
| OFFICE_EVENT_DELETE_APPROVED | Office event delete approved |
| OFFICE_EVENT_DELETE_DENIED | Office event delete denied |
| OFFICE_EVENT_DELETE_EXECUTED | Office event deleted |

### AI & Tools
| action_type | label |
|-------------|-------|
| note_aid_execute | Note Aid used |
| agent_assist | Focus Assistant used |
| agent_tool_execute | Focus Assistant tool executed |

### Tasks
| action_type | label |
|-------------|-------|
| assigned | Task assigned to user |
| updated | Task updated |
| completed | Task completed |
| overridden | Task overridden by admin |
| due_date_changed | Task due date changed |
| reminder_sent | Task reminder sent |
| deleted | Task deleted |

### Page Views
| action_type | label |
|-------------|-------|
| dashboard_view | Dashboard viewed |
| audit_center_viewed | Audit Center viewed |
| admin_dashboard_view | Admin dashboard viewed |
| admin_page_view | Admin page viewed |

---

## Viewing and Evaluating Audits

1. **Audit Center** (`/admin/audit-center`): Select an agency, then filter by source, category, or action type.
2. **Category filter**: Use the Category dropdown to see only actions in a given category (e.g. Staff, Documents, Tasks).
3. **Action filter**: Use the Action dropdown to narrow to a specific action (e.g. "User archived", "Task completed").
4. **Source filter**: Filter by log source (User activity, Admin actions, Task audit, etc.).
5. **Export**: Use "Export CSV" to download the filtered results for external analysis.
6. **Links**: Click user, client, or link columns to navigate to the relevant record.

---

## Instructions for Adding New Actions

### 1. Add to this MD file

Add the new action under the appropriate category (or create a new category). Format:

```
| action_type | label |
|-------------|-------|
| new_action  | Plain English description |
```

### 2. Update the registry files

Add the same entry to **both**:

- `frontend/src/utils/auditActionRegistry.js` → `AUDIT_ACTION_REGISTRY`
- `backend/src/config/auditActionRegistry.js` → `AUDIT_ACTION_REGISTRY`

Format:
```javascript
new_action: { label: 'Plain English description', category: 'Category Name' },
```

### 3. Add new category (if needed)

1. Add the category to `AUDIT_CATEGORIES` in `frontend/src/utils/auditActionRegistry.js`
2. Add a section in this MD file
3. Add `getActionTypesForCategory` support in the backend registry (it derives from the object, so no extra step)

---

## Where Actions Are Logged

| Source | Tables / Services |
|--------|-------------------|
| User activity | `user_activity_log` via `ActivityLogService.logActivity`, `logAuditEvent` |
| Admin actions | `admin_audit_log` via `AdminAuditLog.logAction` |
| Client access | `client_access_logs` via `logClientAccess` |
| PHI documents | `phi_document_audit_logs` via `PhiDocumentAuditLog.create` |
| Support tickets | `support_tickets`, `support_ticket_messages` (derived) |
| Task audit | `task_audit_log` via `TaskAuditLog.logAction` |
| Task deletion | `task_deletion_log` via `TaskDeletionLog.logDeletion` |

**Search for:** `actionType`, `action_type`, `logActivity`, `logAuditEvent`, `logAction`, `PhiDocumentAuditLog.create`, `logClientAccess`

---

## Changelog

| Date | Change |
|------|--------|
| 2025-02-20 | Initial registry with all categories and actions |
| 2025-02-21 | Added School Portal category and actions; added user/client links in Audit Center; added school portal audit logging |
| 2025-02-21 | Added Staff actions: user_profile_updated, user_archived, user_restored, user_status_changed, user_assigned_to_agency, user_removed_from_agency, supervisor_privileges_toggled, user_marked_complete, user_marked_terminated, user_deactivated |
| 2025-02-21 | Added Client Access actions: client_created, client_updated, client_status_changed, client_admin_note_updated |
| 2025-02-21 | Added clinical create/view actions: clinical_note_created, clinical_claim_created, clinical_document_created, clinical_artifacts_viewed |
| 2025-02-21 | Added document_status_updated, compliance_checklist_updated; enhanced client links from metadata for admin_action and user_activity |
| 2025-02-21 | Refined all labels to plain English; reorganized Documents section with subsections (clinical, checklists, admin, general) |
| 2025-02-21 | Added clinical_session_started for bootstrapClinicalSession; fixed support ticket links to use /admin/support-tickets with ticketId |
| 2025-02-21 | Added task_audit source to Audit Center; PHI document deep linking (documentId); module/task links with tab=training; dashboard_view logging |
| 2025-02-21 | Added task_deletion source; agency_id on task_deletion_log; TaskDeletionLog in task.controller deleteTask |
| 2025-02-21 | Added audit_center_viewed, admin_dashboard_view, admin_page_view (router guard for admin routes) |
| 2025-02-21 | Clinical notes supervisor signoff: auto-create signoff on note creation, supervisor sign UI |
| 2025-02-21 | Enhanced AUDIT_REGISTRY with overview, viewing guide; all actions plain English and categorized |
