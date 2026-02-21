# Audit Action Registry

**Last updated:** 2025-02-21

This document is the source of truth for Audit Center categories and actions. Use it to:
- See what's currently registered
- Add new actions or categories
- Remind the AI (or yourself) to sync new log calls into the registry

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
| Authentication | Login, logout, password, session |
| Staff | User management, permissions, payroll access |
| Training | Modules, tracks, intake, onboarding |
| Documents | PHI docs, admin docs, clinical records, uploads |
| Client Access | Viewing clients, notes |
| School Portal | School staff roster, comments, waitlist |
| Communications | SMS, calls, voicemail |
| Support | Support tickets |
| Billing & Payroll | Payroll writes, billing policies |
| Office & Scheduling | Office events, scheduling |
| AI & Tools | Note Aid, Focus Assistant |
| Tasks | Task assignments, completions |
| Other | Fallback for unregistered actions |

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

### Training
| action_type | label |
|-------------|-------|
| module_start | Module started |
| module_end | Module ended |
| module_complete | Module completed |
| reset_module | Module reset by admin |
| reset_track | Track reset by admin |
| mark_module_complete | Module marked complete by admin |
| mark_track_complete | Track marked complete by admin |
| intake_approval | Intake approved |

### Documents
| action_type | label |
|-------------|-------|
| admin_doc_deleted | Admin document deleted |
| admin_doc_restored | Admin document restored |
| admin_doc_legal_hold_set | Admin document legal hold set |
| admin_doc_legal_hold_released | Admin document legal hold released |
| clinical_note_deleted | Clinical note deleted |
| clinical_note_restored | Clinical note restored |
| clinical_note_legal_hold_set | Clinical note legal hold set |
| clinical_note_legal_hold_released | Clinical note legal hold released |
| clinical_claim_deleted | Clinical claim deleted |
| clinical_claim_restored | Clinical claim restored |
| clinical_claim_legal_hold_set | Clinical claim legal hold set |
| clinical_claim_legal_hold_released | Clinical claim legal hold released |
| clinical_document_deleted | Clinical document deleted |
| clinical_document_restored | Clinical document restored |
| clinical_document_legal_hold_set | Clinical document legal hold set |
| clinical_document_legal_hold_released | Clinical document legal hold released |
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

### School Portal
| action_type | label |
|-------------|-------|
| school_portal_roster_viewed | School portal roster viewed |
| school_portal_comments_viewed | School portal comments viewed |
| school_portal_comment_posted | School portal comment posted |
| school_portal_waitlist_viewed | School portal waitlist note viewed |
| school_portal_waitlist_updated | School portal waitlist note updated |

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
| payroll_write | Payroll data written |
| BILLING_POLICY_PROFILE_PUBLISHED | Billing policy profile published |
| BILLING_POLICY_RULE_UPSERTED | Billing policy rule updated |
| BILLING_POLICY_ACTIVATED | Billing policy activated |
| BILLING_POLICY_SERVICE_CODE_ACTIVATION_UPDATED | Billing policy service code activation updated |
| BILLING_POLICY_INGESTION_UPLOADED | Billing policy ingestion uploaded |
| BILLING_POLICY_CANDIDATE_REVIEWED | Billing policy candidate reviewed |
| BILLING_POLICY_RULES_PUBLISHED | Billing policy rules published |

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
| assigned | Task assigned |
| updated | Task updated |
| completed | Task completed |
| overridden | Task overridden |
| due_date_changed | Task due date changed |
| reminder_sent | Task reminder sent |

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

**Search for:** `actionType`, `action_type`, `logActivity`, `logAuditEvent`, `logAction`, `PhiDocumentAuditLog.create`, `logClientAccess`

---

## Changelog

| Date | Change |
|------|--------|
| 2025-02-20 | Initial registry with all categories and actions |
| 2025-02-21 | Added School Portal category and actions; added user/client links in Audit Center; added school portal audit logging |
