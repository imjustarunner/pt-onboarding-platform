<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="modal-content large" @click.stop>
      <div class="modal-header">
        <div style="display:flex; flex-direction: column; gap: 6px;">
          <h2 style="margin:0;">Client: {{ client.initials }}</h2>
          <div v-if="isBackofficeRole" style="display:flex; gap: 10px; align-items:center; flex-wrap: wrap;">
            <template v-if="switchableAgencies.length > 1">
              <span class="muted" style="font-weight: 800;">Agency:</span>
              <select
                v-model="selectedAgencyId"
                class="inline-select"
                :disabled="switchingAgency"
                @change="onSwitchAgency"
              >
                <option v-for="a in switchableAgencies" :key="a.id" :value="String(a.id)">
                  {{ a.name }}
                </option>
              </select>
              <span v-if="switchingAgency" class="muted">Switching…</span>
            </template>
            <template v-else-if="clientAgenciesNote">
              <span class="muted">{{ clientAgenciesNote }}</span>
            </template>
          </div>
        </div>
        <button @click="handleClose" class="btn-close">×</button>
      </div>

      <!-- Tab Navigation -->
      <div class="modal-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="['tab-button', { active: activeTab === tab.id }]"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="tab-content">
        <!-- Overview Tab -->
        <div v-if="activeTab === 'overview'" class="detail-section">
          <div v-if="canEditAccount" class="form-actions" style="margin-top: 0; margin-bottom: 12px; justify-content: flex-start;">
            <button v-if="!editingOverview" class="btn btn-secondary" type="button" @click="startEditOverview">
              Edit client
            </button>
            <template v-else>
              <button class="btn btn-primary" type="button" @click="saveOverview" :disabled="savingOverview">
                {{ savingOverview ? 'Saving…' : 'Save' }}
              </button>
              <button class="btn btn-secondary" type="button" @click="cancelEditOverview" :disabled="savingOverview">
                Cancel
              </button>
            </template>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <label>Initials</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <input v-model="overviewForm.initials" class="inline-input" placeholder="MesJuv" />
                </template>
                <template v-else>
                  {{ client.initials }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>School</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <select v-model="overviewForm.organization_id" class="inline-select">
                    <option :value="''">—</option>
                    <option v-for="o in overviewOrganizations" :key="o.id" :value="String(o.id)">
                      {{ o.name }}
                    </option>
                  </select>
                </template>
                <template v-else>
                  {{ client.organization_name || '-' }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Client Status</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <select v-model="overviewForm.client_status_id" class="inline-select">
                    <option :value="''">—</option>
                    <option v-for="s in overviewClientStatuses" :key="s.id" :value="String(s.id)">{{ s.label }}</option>
                  </select>
                </template>
                <template v-else>
                  {{ client.client_status_label || '-' }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Archived</label>
              <div class="info-value">
                {{ isClientArchived ? 'Yes' : 'No' }}
              </div>
            </div>
            <div v-if="canViewAdminNote" class="info-item admin-note-item">
              <label>Admin Note</label>
              <div
                class="info-value admin-note-trigger"
                @mouseenter="openAdminNotePopover"
                @mouseleave="closeAdminNotePopoverSoon"
              >
                <span v-if="adminNoteLoading" class="muted">Loading…</span>
                <span v-else-if="adminNoteMessage">
                  <span class="admin-note-indicator" title="Admin note available">✓</span>
                  <span class="muted" style="margin-left: 8px;">Hover to view/edit</span>
                </span>
                <span v-else class="muted">Hover to add</span>

                <div
                  v-if="adminNotePopoverOpen"
                  class="admin-note-popover"
                  @mouseenter="cancelCloseAdminNotePopover"
                  @mouseleave="closeAdminNotePopoverSoon"
                >
                  <div class="muted" style="font-size: 12px; margin-bottom: 6px; font-weight: 800;">Internal (admin only)</div>
                  <textarea v-model="adminNoteDraft" class="admin-note-textarea" rows="5" placeholder="Add an internal admin note…" />
                  <div style="display:flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
                    <button class="btn btn-secondary btn-sm" type="button" @click="closeAdminNotePopoverNow" :disabled="adminNoteSaving">
                      Close
                    </button>
                    <button
                      class="btn btn-primary btn-sm"
                      type="button"
                      @click="saveAdminNote"
                      :disabled="adminNoteSaving || !String(adminNoteDraft || '').trim()"
                    >
                      {{ adminNoteSaving ? 'Saving…' : 'Save' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="info-item">
              <label>Provider</label>
              <div class="info-value">
                <div>
                  <div v-if="overviewProvidersLoading" class="muted">Loading…</div>
                  <div v-else-if="overviewProviders.length === 0">{{ client.provider_name || 'Not assigned' }}</div>
                  <div v-else class="provider-list">
                    <div v-for="p in overviewProviders" :key="p.id" class="provider-row">
                      <div>
                        <strong>{{ p.provider_last_name }}, {{ p.provider_first_name }}</strong>
                        <span v-if="p.is_primary" class="badge badge-success" style="margin-left: 8px;">Primary</span>
                        <div v-if="p.organization_name" class="muted" style="margin-top: 2px;">
                          {{ p.organization_name }}
                        </div>
                      </div>
                      <div class="muted" style="white-space: nowrap;">
                        {{ p.service_day || 'Unknown' }}
                      </div>
                    </div>
                  </div>
                  <div class="hint" style="margin-top: 4px;">
                    Editing affiliated providers is managed on the <strong>Affiliations</strong> tab.
                  </div>
                </div>
              </div>
            </div>
            <div class="info-item">
              <label>Submission Date</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <input v-model="overviewForm.submission_date" type="date" class="inline-input" />
                </template>
                <template v-else>
                  {{ formatDate(client.submission_date) }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Document Status</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <details ref="docStatusDetailsEl" class="doc-dropdown">
                    <summary class="inline-select" style="list-style:none; cursor:pointer;">
                      {{ documentStatusSummaryText || (client.paperwork_status_label || '—') }}
                    </summary>
                    <div style="margin-top: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-alt);">
                      <div class="hint" style="margin-bottom: 8px;">
                        Select the items that are <strong>Needed</strong>. When none are needed, status becomes <strong>Completed</strong>.
                      </div>

                      <div v-if="docChecklistAvailable">
                        <div class="check-row" style="margin-bottom: 6px;">
                          <label class="check-left">
                            <input type="checkbox" :checked="docIsCompleted" disabled />
                            <span class="check-label"><strong>Completed</strong></span>
                          </label>
                          <div class="check-right">
                            <span v-if="docIsCompleted" class="badge badge-success">Yes</span>
                            <span v-else class="badge badge-secondary">No</span>
                            <button
                              v-if="canEditPaperwork && !docIsCompleted"
                              type="button"
                              class="btn btn-secondary btn-sm"
                              :disabled="docChecklistSaving"
                              @click="onMarkDocsCompletedFromOverview"
                              style="margin-left: 10px;"
                            >
                              Mark completed
                            </button>
                          </div>
                        </div>

                        <div v-for="it in docNeededOptions" :key="String(it.status_key || it.paperwork_status_id)" class="check-row">
                          <label class="check-left">
                            <input
                              type="checkbox"
                              :disabled="!canEditPaperwork || docChecklistSaving"
                              :checked="!!it.is_needed"
                              @change="onToggleDocNeeded(it, $event)"
                            />
                            <span class="check-label">{{ it.label }}</span>
                          </label>
                          <div class="check-right">
                            <span v-if="it.is_needed" class="badge badge-warning">Needed</span>
                            <span v-else class="badge badge-secondary">Received</span>
                          </div>
                        </div>
                      </div>

                      <div v-else class="muted">
                        Document Status checklist is not available yet (missing migration).
                      </div>
                    </div>
                  </details>
                </template>
                <template v-else>
                  <span v-if="documentStatusSummaryText" class="doc-status-pill">{{ documentStatusSummaryText }}</span>
                  <span v-else>{{ client.paperwork_status_label || '-' }}</span>
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Insurance</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <select v-model="overviewForm.insurance_type_id" class="inline-select">
                    <option :value="''">—</option>
                    <option v-for="i in overviewInsuranceTypes" :key="i.id" :value="String(i.id)">{{ i.label }}</option>
                  </select>
                </template>
                <template v-else>
                  {{ client.insurance_type_label || '-' }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Doc Date</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <input v-model="overviewForm.doc_date" type="date" class="inline-input" />
                </template>
                <template v-else>
                  {{ formatDate(client.doc_date) }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>School Year</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <input v-model="overviewForm.school_year" class="inline-input" placeholder="2025-2026" />
                </template>
                <template v-else>
                  {{ client.school_year || '-' }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Grade</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <input v-model="overviewForm.grade" class="inline-input" placeholder="5" />
                </template>
                <template v-else>
                  {{ client.grade || '-' }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Skills client</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <label style="display:flex; align-items:center; gap: 8px;">
                    <input type="checkbox" v-model="overviewForm.skills" />
                    <span>{{ overviewForm.skills ? 'Yes' : 'No' }}</span>
                  </label>
                </template>
                <template v-else>
                  {{ client.skills ? 'Yes' : 'No' }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Referral Date</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <input v-model="overviewForm.referral_date" type="date" class="inline-input" />
                </template>
                <template v-else>
                  {{ formatDate(client.referral_date) }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Client primary language</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <input v-model="overviewForm.primary_client_language" class="inline-input" placeholder="e.g., English" />
                </template>
                <template v-else>
                  {{ client.primary_client_language || '-' }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Guardian primary language</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <input v-model="overviewForm.primary_parent_language" class="inline-input" placeholder="e.g., Spanish" />
                </template>
                <template v-else>
                  {{ client.primary_parent_language || '-' }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Upload status (legacy)</label>
              <div class="info-value">
                <span class="muted">{{ formatDocumentStatus(client.document_status) }}</span>
              </div>
            </div>
            <div class="info-item">
              <label>Source</label>
              <div class="info-value">
                <template v-if="editingOverview">
                  <select v-model="overviewForm.source" class="inline-select">
                    <option value="">—</option>
                    <option value="BULK_IMPORT">Bulk Import</option>
                    <option value="SCHOOL_UPLOAD">School Upload</option>
                    <option value="DIGITAL_FORM">Digital Form</option>
                    <option value="ADMIN_CREATED">Admin Created</option>
                  </select>
                </template>
                <template v-else>
                  {{ formatSource(client.source) }}
                </template>
              </div>
            </div>
            <div class="info-item">
              <label>Last Activity</label>
              <div class="info-value">{{ formatDate(client.last_activity_at) || '-' }}</div>
            </div>
          </div>

          <div v-if="canEditAccount && editingOverview" class="quick-actions">
            <h3>Quick Actions</h3>
            <div class="actions-grid">
              <button
                v-if="!isClientArchived"
                class="btn btn-danger"
                type="button"
                @click="archiveClient"
              >
                Archive client
              </button>
              <button
                v-else
                class="btn btn-secondary"
                type="button"
                @click="unarchiveClient"
              >
                Unarchive client
              </button>
            </div>
          </div>
        </div>

        <!-- Compliance Checklist Tab -->
        <div v-if="activeTab === 'checklist'" class="detail-section">
          <h3 style="margin-top: 0;">Compliance Checklist</h3>
          <p class="hint" style="margin-top:-6px;">
            Operational tracking (non-clinical). Providers + admin/staff can update.
          </p>

          <div class="info-grid">
            <div class="info-item">
              <label>Parents Contacted</label>
              <div class="info-value">
                <input type="date" v-model="checklist.parentsContactedAt" class="inline-input" />
              </div>
            </div>
            <div class="info-item">
              <label>Contact Successful?</label>
              <div class="info-value">
                <select v-model="checklist.parentsContactedSuccessful" class="inline-select">
                  <option :value="''">—</option>
                  <option :value="'true'">Successful</option>
                  <option :value="'false'">Unsuccessful</option>
                </select>
              </div>
            </div>
            <div class="info-item">
              <label>Intake Date</label>
              <div class="info-value">
                <input type="date" v-model="checklist.intakeAt" class="inline-input" />
              </div>
            </div>
            <div class="info-item">
              <label>First Date of Service</label>
              <div class="info-value">
                <input type="date" v-model="checklist.firstServiceAt" class="inline-input" />
              </div>
            </div>
          </div>

          <div class="form-actions" style="margin-top: 12px;">
            <button class="btn btn-primary" @click="saveChecklist" :disabled="savingChecklist">
              {{ savingChecklist ? 'Saving…' : 'Save Checklist' }}
            </button>
            <span v-if="checklistAuditText" class="hint" style="margin-left: 10px;">
              {{ checklistAuditText }}
            </span>
          </div>
        </div>

        <!-- Status History Tab -->
        <div v-if="activeTab === 'history'" class="detail-section">
          <div v-if="historyLoading" class="loading">Loading history...</div>
          <div v-else-if="historyError" class="error">{{ historyError }}</div>
          <div v-else-if="history.length === 0" class="empty-state">
            <p>No history recorded yet.</p>
          </div>
          <div v-else class="history-timeline">
            <div
              v-for="entry in history"
              :key="entry.id"
              class="history-item"
            >
              <div class="history-time">{{ formatDateTime(entry.changed_at) }}</div>
              <div class="history-content">
                <div class="history-field">
                  <strong>{{ formatFieldName(entry.field_changed) }}</strong>
                </div>
                <div class="history-change">
                  <span v-if="entry.from_value" class="from-value">{{ entry.from_value }}</span>
                  <span class="arrow">→</span>
                  <span class="to-value">{{ entry.to_value }}</span>
                </div>
                <div v-if="entry.changed_by_name" class="history-author">
                  Changed by: {{ entry.changed_by_name }}
                </div>
                <div v-if="entry.note" class="history-note">
                  Note: {{ entry.note }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Access Log Tab -->
        <div v-if="activeTab === 'access'" class="detail-section">
          <div v-if="!canViewAccessLog" class="empty-state">
            <p>You don’t have permission to view access logs.</p>
          </div>
          <div v-else>
            <div v-if="accessLoading" class="loading">Loading access log…</div>
            <div v-else-if="accessError" class="error">{{ accessError }}</div>
            <div v-else-if="accessLog.length === 0" class="empty-state">
              <p>No access events recorded yet.</p>
            </div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in accessLog" :key="e.id">
                    <td>{{ formatDateTime(e.created_at) }}</td>
                    <td>{{ formatAccessUser(e) }}</td>
                    <td>{{ e.user_role || '—' }}</td>
                    <td>{{ e.action }}</td>
                    <td>{{ e.ip_address || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="hint" style="margin-top: 8px;">
                Tracks access to client profile + notes (best-effort).
              </div>
            </div>
          </div>
        </div>

        <!-- Messages/Notes Tab -->
        <div v-if="activeTab === 'messages'" class="detail-section">
          <div v-if="notesLoading" class="loading">Loading messages…</div>
          <div v-else-if="notesError" class="error">{{ notesError }}</div>
          <div v-else class="messages-container">
            <div class="phi-warning">
              <strong>Reminder:</strong> Use initials only. Do not include PHI. This is not an EHR.
            </div>

            <div class="messages-header-row">
              <h3 style="margin:0;">Messages</h3>
              <button class="btn btn-secondary btn-sm" type="button" @click="toggleMessagesCollapsed">
                {{ messagesCollapsed ? 'Show' : 'Hide' }}
              </button>
            </div>

            <div v-if="!messagesCollapsed" class="messages-list">
              <div v-if="sharedMessages.length === 0" class="empty-state">
                <p>No messages yet.</p>
              </div>
              <div
                v-for="note in sharedMessages"
                :key="note.id"
                class="message-item"
              >
                <div class="message-header">
                  <span class="message-author">{{ note.author_name || 'Unknown' }}</span>
                  <span class="message-date">{{ formatDateTime(note.created_at) }}</span>
                  <span v-if="note.category" class="category-badge">{{ formatCategory(note.category) }}</span>
                </div>
                <div class="message-content">{{ note.message }}</div>
              </div>
            </div>

            <div class="add-message-form">
              <h3>Add Message</h3>
              <div class="message-options">
                <label class="category-label">
                  Category
                  <select v-model="newNoteCategory" class="inline-select">
                    <option value="general">General</option>
                    <option value="status">Status update</option>
                    <option value="administrative">Administrative</option>
                    <option value="billing">Billing</option>
                  </select>
                </label>
              </div>
              <textarea
                v-model="newNoteMessage"
                placeholder="Enter your message (initials only)..."
                rows="4"
                class="message-input"
              ></textarea>
              <button
                @click="createNote"
                class="btn btn-primary"
                :disabled="!newNoteMessage.trim() || creatingNote"
              >
                {{ creatingNote ? 'Sending...' : 'Send Message' }}
              </button>
            </div>

            <div v-if="isBackofficeRole" class="internal-notes-panel">
              <div class="messages-header-row" style="margin-top: 16px;">
                <h3 style="margin:0;">Internal Notes (admin only)</h3>
                <button class="btn btn-secondary btn-sm" type="button" @click="openAdminNoteModal">
                  Admin Note
                </button>
              </div>
              <div class="hint" style="margin-top: 6px;">
                Internal notes are for backoffice staff only. They are not client-facing “messages”.
              </div>

              <div v-if="internalNotes.length === 0" class="empty-state" style="margin-top: 10px;">
                <p>No internal notes yet.</p>
              </div>
              <div v-else class="messages-list" style="margin-top: 10px;">
                <div v-for="note in internalNotes" :key="note.id" class="message-item internal-note">
                  <div class="message-header">
                    <span class="message-author">{{ note.author_name || 'Unknown' }}</span>
                    <span class="message-date">{{ formatDateTime(note.created_at) }}</span>
                    <span v-if="note.category" class="category-badge">{{ formatCategory(note.category) }}</span>
                    <span class="internal-badge">Internal</span>
                  </div>
                  <div class="message-content">{{ note.message }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Admin Note Modal (internal-only) -->
        <div v-if="showAdminNoteModal" class="modal-overlay" @click.self="closeAdminNoteModal">
          <div class="modal-content" @click.stop style="max-width: 720px;">
            <h3 style="margin-top:0;">Admin Note</h3>
            <p class="hint" style="margin-top: 6px;">
              Internal only (admin/support/staff). Not visible to school staff or providers.
            </p>

            <textarea v-model="adminNoteDraft" class="admin-note-textarea" rows="7" placeholder="Add an internal admin note…" />

            <div class="modal-actions" style="margin-top: 12px;">
              <button class="btn btn-secondary" type="button" @click="closeAdminNoteModal" :disabled="adminNoteSaving">
                Close
              </button>
              <button
                class="btn btn-primary"
                type="button"
                @click="saveAdminNote"
                :disabled="adminNoteSaving || !String(adminNoteDraft || '').trim()"
              >
                {{ adminNoteSaving ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Guardians Tab -->
        <div v-if="activeTab === 'guardians'" class="detail-section">
          <div class="phi-warning" style="margin-bottom: 12px;">
            <strong>Non-clinical portal access:</strong> Guardians can be given access to docs, links, and program materials.
          </div>

          <div v-if="!canManageGuardians" class="empty-state">
            <p>You don’t have permission to manage guardians for this client.</p>
          </div>

          <div v-else>
            <div v-if="guardiansError" class="error" style="margin-bottom: 10px;">{{ guardiansError }}</div>
            <div style="display:flex; justify-content: space-between; align-items:center; gap: 12px; margin-bottom: 12px;">
              <div class="hint">Add one or more guardian accounts (e.g., divorced guardians) with their own logins.</div>
              <button type="button" class="btn btn-primary" @click="openAddGuardian">Add Guardian</button>
            </div>

            <div v-if="guardiansLoading" class="loading">Loading guardians…</div>
            <div v-else-if="(guardians || []).length === 0" class="empty-state">
              <p>No guardians yet.</p>
            </div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Relationship title</th>
                    <th>Enabled</th>
                    <th class="right"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="g in guardians" :key="g.guardian_user_id">
                    <td>{{ g.first_name }} {{ g.last_name }}</td>
                    <td>{{ g.email }}</td>
                    <td style="min-width: 220px;">
                      <input v-model="g.relationship_title" type="text" />
                    </td>
                    <td>
                      <input v-model="g.access_enabled" type="checkbox" :true-value="1" :false-value="0" />
                    </td>
                    <td class="right" style="white-space: nowrap;">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="updatingGuardianId === g.guardian_user_id"
                        @click="updateGuardian(g)"
                      >
                        {{ updatingGuardianId === g.guardian_user_id ? 'Saving…' : 'Save' }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-danger btn-sm"
                        :disabled="updatingGuardianId === g.guardian_user_id"
                        @click="removeGuardian(g)"
                        style="margin-left: 8px;"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="lastInviteLink" class="phi-warning" style="margin-top: 12px;">
              <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
                <div>
                  <strong>Invite link generated</strong>
                  <div class="hint">Send this to the guardian to set access (expires in 48 hours).</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" @click="copyText(lastInviteLink)">Copy link</button>
              </div>
              <div style="margin-top: 8px;">
                <input :value="lastInviteLink" readonly style="width:100%; font-family: monospace; font-size: 12px;" @click="$event.target.select()" />
              </div>
            </div>
          </div>

          <!-- Add Guardian Modal -->
          <div v-if="showAddGuardianModal" class="modal-overlay" @click.self="closeAddGuardian">
            <div class="modal-content" @click.stop style="max-width: 720px;">
              <div class="modal-header" style="padding: 16px 18px;">
                <h3 style="margin:0;">Add guardian access</h3>
                <button class="btn-close" @click="closeAddGuardian">×</button>
              </div>
              <div style="padding: 18px;">
                <div class="form-group">
                  <label>Email *</label>
                  <input v-model="addGuardianForm.email" type="email" placeholder="guardian@email.com" />
                </div>
                <div class="filters-row">
                  <div class="filters-group" style="flex:1;">
                    <label class="filters-label">First name *</label>
                    <input v-model="addGuardianForm.firstName" class="filters-input" type="text" />
                  </div>
                  <div class="filters-group" style="flex:1;">
                    <label class="filters-label">Last name *</label>
                    <input v-model="addGuardianForm.lastName" class="filters-input" type="text" />
                  </div>
                </div>
                <div class="form-group">
                  <label>Relationship title</label>
                  <input v-model="addGuardianForm.relationshipTitle" type="text" placeholder="e.g., Mom, Dad, Guardian" />
                </div>
                <div class="form-group">
                  <label class="checkbox-label">
                    <input v-model="addGuardianForm.accessEnabled" type="checkbox" />
                    Enabled
                  </label>
                </div>
                <div class="form-section-divider" style="margin-top: 14px; margin-bottom: 10px;">
                  <h4 style="margin:0;">Permissions</h4>
                </div>
                <div class="filters-row" style="flex-wrap: wrap;">
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewDocs" type="checkbox" />
                    Can view docs
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canSignDocs" type="checkbox" />
                    Can sign docs
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewLinks" type="checkbox" />
                    Can view links
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewProgramMaterials" type="checkbox" />
                    Can view program materials
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewProgress" type="checkbox" />
                    Can view progress
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canMessage" type="checkbox" />
                    Can message (rare)
                  </label>
                </div>

                <div style="display:flex; justify-content:flex-end; gap: 10px; margin-top: 18px;">
                  <button type="button" class="btn btn-secondary" @click="closeAddGuardian" :disabled="addingGuardian">Cancel</button>
                  <button type="button" class="btn btn-primary" @click="addGuardian" :disabled="addingGuardian">
                    {{ addingGuardian ? 'Creating…' : 'Create + Generate invite link' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Assignments Tab (backoffice only) -->
        <div v-if="activeTab === 'assignments'" class="detail-section">
          <div class="form-section-divider" style="margin-top: 0; margin-bottom: 10px;">
            <h3 style="margin:0;">Client assignments</h3>
            <div class="hint">Manage multi-agency affiliations, multi-org affiliations, and scoped provider assignments.</div>
          </div>

          <div v-if="assignmentsError" class="error" style="text-align:left;">{{ assignmentsError }}</div>

          <div class="grid" style="display:grid; grid-template-columns: 1fr; gap: 16px;">
            <div class="card" style="border: 1px solid var(--border); border-radius: 12px; padding: 14px;">
              <h4 style="margin:0 0 10px;">Manage multi-agency affiliations</h4>
              <div class="hint" style="margin-bottom: 10px;">
                If a user has access to multiple agencies for a client, you can switch the client’s primary agency from the header dropdown.
              </div>
              <div v-if="clientAgenciesNote" class="muted" style="margin-bottom: 10px;">{{ clientAgenciesNote }}</div>

              <div v-if="(clientAgencyAffiliations || []).length === 0" class="hint">No agency affiliations found.</div>
              <div v-else class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Agency</th>
                      <th>Primary</th>
                      <th class="right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in clientAgencyAffiliations" :key="a.agency_id">
                      <td>{{ a.agency_name || `Agency ${a.agency_id}` }}</td>
                      <td>{{ a.is_primary ? 'Yes' : 'No' }}</td>
                      <td class="right" style="white-space: nowrap;">
                        <button
                          v-if="!a.is_primary"
                          type="button"
                          class="btn btn-secondary btn-sm"
                          :disabled="switchingAgency"
                          @click="selectedAgencyId = String(a.agency_id); onSwitchAgency()"
                        >
                          Set primary
                        </button>
                        <button
                          v-if="!a.is_primary"
                          type="button"
                          class="btn btn-danger btn-sm"
                          :disabled="switchingAgency"
                          @click="removeAgencyAffiliation(a.agency_id)"
                          style="margin-left: 8px;"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style="display:flex; gap: 10px; align-items:end; margin-top: 12px; flex-wrap: wrap;">
                <div style="min-width: 280px; flex: 1;">
                  <label class="filters-label">Add agency affiliation</label>
                  <select v-model="addAgencyAffiliationId" class="filters-select">
                    <option value="">Select…</option>
                    <option v-for="a in addableAgencyOptions" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
                  </select>
                </div>
                <label class="checkbox-label" style="min-width: 200px;">
                  <input v-model="addAgencyMakePrimary" type="checkbox" />
                  Set as primary
                </label>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="switchingAgency || !addAgencyAffiliationId"
                  @click="addAgencyAffiliation"
                >
                  Add
                </button>
              </div>
            </div>

            <div class="card" style="border: 1px solid var(--border); border-radius: 12px; padding: 14px;">
              <h4 style="margin:0 0 10px;">Multi manage multi-org affiliations (school/program)</h4>
              <div v-if="affiliationsLoading" class="loading">Loading…</div>
              <div v-else>
                <div v-if="affiliations.length === 0" class="hint">No affiliations yet.</div>
                <div v-else class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Type</th>
                        <th>Primary</th>
                        <th class="right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="a in affiliations" :key="a.organization_id">
                        <td>{{ a.organization_name }}</td>
                        <td>{{ a.organization_type || '—' }}</td>
                        <td>{{ a.is_primary ? 'Yes' : 'No' }}</td>
                        <td class="right" style="white-space: nowrap;">
                          <button
                            v-if="!a.is_primary"
                            type="button"
                            class="btn btn-secondary btn-sm"
                            :disabled="savingAffiliation"
                            @click="setPrimaryAffiliation(a.organization_id)"
                          >
                            Set primary
                          </button>
                          <button
                            v-if="!a.is_primary"
                            type="button"
                            class="btn btn-danger btn-sm"
                            :disabled="savingAffiliation"
                            @click="removeAffiliation(a.organization_id)"
                            style="margin-left: 8px;"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style="display:flex; gap: 10px; align-items:end; margin-top: 12px; flex-wrap: wrap;">
                  <div style="min-width: 280px; flex: 1;">
                    <label class="filters-label">Add affiliation</label>
                    <select v-model="addAffiliationOrgId" class="filters-select">
                      <option value="">Select…</option>
                      <option v-for="o in availableAffiliationOptions" :key="o.id" :value="String(o.id)">
                        {{ o.name }} <span v-if="o.organization_type">({{ o.organization_type }})</span>
                      </option>
                    </select>
                  </div>
                  <label class="checkbox-label" style="min-width: 200px;">
                    <input v-model="addAffiliationMakePrimary" type="checkbox" />
                    Make primary
                  </label>
                  <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="savingAffiliation || !addAffiliationOrgId"
                    @click="addAffiliation"
                  >
                    {{ savingAffiliation ? 'Saving…' : 'Add' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="card" style="border: 1px solid var(--border); border-radius: 12px; padding: 14px;">
              <h4 style="margin:0 0 10px;">Scoped provider assignments (per affiliation)</h4>
              <div style="display:flex; gap: 10px; flex-wrap: wrap; align-items:end; margin-bottom: 12px;">
                <div style="min-width: 280px; flex: 1;">
                  <label class="filters-label">Affiliation</label>
                  <select v-model="selectedAssignmentOrgId" class="filters-select">
                    <option value="">Select…</option>
                    <option v-for="a in affiliations" :key="a.organization_id" :value="String(a.organization_id)">
                      {{ a.organization_name }}
                    </option>
                  </select>
                </div>
                <button type="button" class="btn btn-secondary" :disabled="!selectedAssignmentOrgId" @click="reloadProviderAssignments">
                  Refresh
                </button>
              </div>

              <div v-if="providerAssignmentsLoading" class="loading">Loading…</div>
              <div v-else-if="providerAssignments.length === 0" class="hint">No providers assigned for this affiliation.</div>
              <div v-else class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Day</th>
                      <th class="right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="pa in providerAssignments" :key="pa.id">
                      <td>
                        {{ pa.provider_last_name }}, {{ pa.provider_first_name }}
                        <span v-if="pa.is_primary" class="badge badge-success" style="margin-left: 8px;">Primary</span>
                      </td>
                      <td>{{ pa.service_day || 'Unknown' }}</td>
                      <td class="right">
                        <button
                          v-if="!pa.is_primary"
                          class="btn btn-secondary btn-sm"
                          type="button"
                          :disabled="savingProviderAssignment"
                          @click="makePrimaryProvider(pa)"
                          style="margin-right: 8px;"
                        >
                          Make primary
                        </button>
                        <button class="btn btn-danger btn-sm" type="button" :disabled="savingProviderAssignment" @click="removeProviderAssignment(pa)">
                          Remove
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="selectedAssignmentOrgId" style="margin-top: 12px;">
                <div class="filters-row" style="flex-wrap: wrap;">
                  <div class="filters-group" style="min-width: 260px; flex: 1;">
                    <label class="filters-label">Provider</label>
                    <select v-model="addProviderUserId" class="filters-select">
                      <option value="">Select…</option>
                      <option v-for="p in providerOptions" :key="p.id" :value="String(p.id)">
                        {{ p.last_name }}, {{ p.first_name }}
                      </option>
                    </select>
                  </div>
                  <div class="filters-group" style="min-width: 200px;">
                    <label class="filters-label">Day</label>
                    <select v-model="addProviderDay" class="filters-select">
                      <option value="">Select…</option>
                      <option v-for="d in availableProviderDaysForSelectedOrg" :key="d" :value="d">{{ d }}</option>
                    </select>
                  </div>
                  <label class="checkbox-label" style="min-width: 180px;">
                    <input v-model="addProviderMakePrimary" type="checkbox" />
                    Make primary
                  </label>
                  <div class="actions" style="align-self: end;">
                    <button
                      type="button"
                      class="btn btn-primary"
                      :disabled="savingProviderAssignment || !addProviderUserId || !addProviderDay"
                      @click="addProviderAssignment"
                    >
                      {{ savingProviderAssignment ? 'Saving…' : 'Assign provider' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Documentation Tab -->
        <div v-if="activeTab === 'phi'" class="detail-section">
          <div class="form-section-divider" style="margin-top: 0; margin-bottom: 10px;">
            <h3 style="margin:0;">Packet / documentation status (no upload required)</h3>
            <div class="hint">
              Use this to record what’s needed/what was received and when. Uploading a file is optional and handled separately below.
            </div>
          </div>

          <div class="panel" style="padding: 14px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 14px;">
            <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <div>
                <h4 style="margin:0;">Document Status checklist</h4>
                <div class="hint" style="margin-top: 4px;">
                  Checked = <strong>Needed</strong>. Unchecked = <strong>Received</strong>. When all are received, status becomes <strong>Completed</strong>.
                </div>
              </div>
              <div class="hint" v-if="docChecklistLoading">Loading…</div>
              <div class="error" v-else-if="docChecklistError" style="margin:0;">{{ docChecklistError }}</div>
            </div>

            <div v-if="docChecklistItems.length" style="margin-top: 10px;">
              <div v-for="it in docChecklistItems" :key="String(it.status_key || it.paperwork_status_id)" class="check-row">
                <label class="check-left">
                  <input
                    v-if="it.status_key !== 'completed'"
                    type="checkbox"
                    :disabled="!canEditPaperwork || docChecklistSaving"
                    :checked="!!it.is_needed"
                    @change="onToggleDocNeeded(it, $event)"
                  />
                  <input
                    v-else
                    type="checkbox"
                    :disabled="!canEditPaperwork || docChecklistSaving"
                    :checked="!!it.is_completed"
                    @change="onToggleDocCompleted($event)"
                  />
                  <span class="check-label">{{ it.label }}</span>
                </label>
                <div class="check-right">
                  <span v-if="it.status_key === 'completed'" class="badge badge-success">Auto</span>
                  <span v-else-if="it.is_needed" class="badge badge-warning">Needed</span>
                  <span v-else class="badge badge-secondary">Received</span>
                  <span v-if="it.received_at && !it.is_needed" class="hint" style="margin-left: 10px;">
                    {{ formatDateTime(it.received_at) }}
                  </span>
                </div>
              </div>
            </div>
            <div v-else-if="!docChecklistLoading" class="muted" style="margin-top: 10px;">
              Checklist not available yet (missing migration) or no statuses configured.
            </div>
          </div>

          <div class="info-grid" style="margin-bottom: 14px;">
            <div class="info-item">
              <label>Current status</label>
              <div class="info-value">{{ currentPaperworkSummary.statusLabel }}</div>
            </div>
            <div class="info-item">
              <label>Current delivery method</label>
              <div class="info-value">{{ currentPaperworkSummary.deliveryLabel }}</div>
            </div>
            <div class="info-item">
              <label>Effective date</label>
              <div class="info-value">{{ currentPaperworkSummary.effectiveDateText }}</div>
            </div>
            <div class="info-item" v-if="currentPaperworkSummary.roiExpiresAtText">
              <label>ROI expires</label>
              <div class="info-value">
                {{ currentPaperworkSummary.roiExpiresAtText }}
                <span v-if="currentPaperworkSummary.roiExpired" style="color: var(--danger, #d92d20); font-weight: 800;">
                  (Expired)
                </span>
              </div>
            </div>
          </div>

          <div v-if="canEditPaperwork" class="panel" style="padding: 14px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 14px;">
            <div class="filters-row" style="flex-wrap: wrap;">
              <div class="filters-group" style="min-width: 220px; flex: 1;">
                <label class="filters-label">Paperwork status *</label>
                <select v-model="paperworkForm.paperworkStatusId" class="filters-select">
                  <option value="">Select…</option>
                  <option v-for="s in paperworkStatuses" :key="s.id" :value="String(s.id)">{{ s.label }}</option>
                </select>
                <div v-if="paperworkStatuses.length === 0" class="hint" style="margin-top: 4px;">
                  No statuses are configured for this agency yet.
                </div>
              </div>
              <div class="filters-group" style="min-width: 220px; flex: 1;">
                <label class="filters-label">Document delivery method</label>
                <select v-model="paperworkForm.deliveryMethodId" class="filters-select" :disabled="!deliveryMethods.length">
                  <option value="">—</option>
                  <option v-for="m in deliveryMethods" :key="m.id" :value="String(m.id)">{{ m.label }}</option>
                </select>
              </div>
              <div class="filters-group" style="min-width: 180px;">
                <label class="filters-label">Effective date *</label>
                <input v-model="paperworkForm.effectiveDate" type="date" class="filters-input" />
              </div>
            </div>
            <div v-if="selectedPaperworkStatusKey === 'roi'" class="filters-row" style="margin-top: 10px;">
              <div class="filters-group" style="min-width: 220px; flex: 1;">
                <label class="filters-label">ROI expiration date *</label>
                <input v-model="paperworkForm.roiExpiresAt" type="date" class="filters-input" />
                <div class="hint" style="margin-top: 4px;">When this date passes, the client’s ROI is considered expired.</div>
              </div>
            </div>
            <div class="filters-row" style="margin-top: 10px;">
              <div class="filters-group" style="flex: 1;">
                <label class="filters-label">Note</label>
                <input v-model="paperworkForm.note" type="text" class="filters-input" placeholder="Optional note (e.g., sent home, provider scanned, etc.)" />
              </div>
              <div class="actions" style="align-self: end;">
                <button class="btn btn-primary" type="button" @click="savePaperworkHistory" :disabled="savingPaperwork">
                  {{ savingPaperwork ? 'Saving…' : 'Save status update' }}
                </button>
              </div>
            </div>
            <div v-if="paperworkError" class="error" style="margin-top: 10px; text-align: left;">{{ paperworkError }}</div>
          </div>

          <div v-if="paperworkHistoryLoading" class="loading">Loading document history…</div>
          <div v-else-if="paperworkHistoryError" class="error">{{ paperworkHistoryError }}</div>
          <div v-else-if="paperworkHistory.length === 0" class="empty-state" style="padding: 18px 12px;">
            <p>No document history yet.</p>
          </div>
          <div v-else class="history-timeline" style="margin-bottom: 18px;">
            <div v-for="h in paperworkHistory" :key="h.id" class="history-item">
              <div class="history-time">{{ formatDate(h.effective_date) }}</div>
              <div class="history-content">
                <div class="history-field">
                  <strong>{{ h.paperwork_status_label || '—' }}</strong>
                </div>
                <div class="hint" style="margin-top: 2px;">
                  Delivery: {{ h.paperwork_delivery_method_label || '—' }}
                  <span v-if="h.changed_by_name"> · by {{ h.changed_by_name }}</span>
                </div>
                <div v-if="h.roi_expires_at" class="hint" style="margin-top: 2px;">
                  ROI expires: {{ formatDate(h.roi_expires_at) }}
                </div>
                <div v-if="h.note" class="history-note">Note: {{ h.note }}</div>
              </div>
            </div>
          </div>

          <div class="form-section-divider" style="margin-top: 18px; margin-bottom: 10px;">
            <h3 style="margin:0;">Files (optional)</h3>
            <div class="hint">Upload a PDF/image only when you need a stored copy.</div>
          </div>
          <PhiDocumentsPanel :client-id="Number(client.id)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import PhiDocumentsPanel from './PhiDocumentsPanel.vue';

const props = defineProps({
  client: {
    type: Object,
    required: true
  },
  initialTab: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close', 'updated']);

const authStore = useAuthStore();

const activeTab = ref('overview');
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isBackofficeRole = computed(() => ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm.value));
const canViewAdminNote = computed(() => isBackofficeRole.value || roleNorm.value === 'supervisor');
const canEditAccount = computed(() => isBackofficeRole.value && hasAgencyAccess.value);

const tabs = computed(() => {
  const base = [
    { id: 'overview', label: 'Overview' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'history', label: 'Status History' },
    { id: 'access', label: 'Access Log' },
    { id: 'messages', label: 'Messages / Notes' },
    { id: 'guardians', label: 'Guardians' },
    { id: 'phi', label: 'Documentation' }
  ];
  if (canEditAccount.value) {
    // Insert before PHI tab
    const idx = base.findIndex((t) => t.id === 'phi');
    base.splice(idx < 0 ? base.length : idx, 0, { id: 'assignments', label: 'Assignments' });
  }
  return base;
});

// Overview tab state
const editingStatus = ref(false);
const statusValue = ref(null);
const availableProviders = ref([]); // used by other tabs (e.g., assignments) and legacy helpers
const skillsValue = ref(false);
const editingOverview = ref(false);
const savingOverview = ref(false);
const overviewForm = ref({
  initials: '',
  organization_id: '',
  client_status_id: '',
  submission_date: '',
  insurance_type_id: '',
  doc_date: '',
  school_year: '',
  grade: '',
  skills: false,
  referral_date: '',
  primary_client_language: '',
  primary_parent_language: '',
  source: ''
});

// Overview edit dropdowns
const overviewOrganizations = ref([]);
const overviewClientStatuses = ref([]);
const overviewInsuranceTypes = ref([]);

const loadOverviewOptions = async () => {
  if (!canEditAccount.value) return;
  const agencyId = Number(props.client?.agency_id);
  if (!agencyId) return;
  try {
    const [orgResp, statusResp, insResp] = await Promise.all([
      api.get(`/agencies/${agencyId}/affiliated-organizations`),
      api.get('/client-settings/client-statuses', { params: { agencyId } }),
      api.get('/client-settings/insurance-types', { params: { agencyId } })
    ]);
    overviewOrganizations.value = (orgResp.data || [])
      .filter((o) => ['school', 'program', 'learning'].includes(String(o?.organization_type || '').toLowerCase()))
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    overviewClientStatuses.value = (statusResp.data || []).filter((s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true));
    overviewInsuranceTypes.value = (insResp.data || []).filter((s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true));
  } catch {
    // best-effort; keep existing lists
  }
};

// History tab state
const history = ref([]);
const historyLoading = ref(false);
const historyError = ref('');

// Access log tab state
const accessLog = ref([]);
const accessLoading = ref(false);
const accessError = ref('');

// Messages tab state
const notes = ref([]);
const notesLoading = ref(false);
const notesError = ref('');
const newNoteMessage = ref('');
const newNoteCategory = ref('general');
const creatingNote = ref(false);

// Split notes into "Messages" (shared) and "Internal Notes" (admin only)
const sharedMessages = computed(() => (notes.value || []).filter((n) => !n?.is_internal_only));
const internalNotes = computed(() => (notes.value || []).filter((n) => !!n?.is_internal_only));

// Persisted collapse state for the messages list
const messagesCollapsed = ref(false);
const messagesCollapsedKey = computed(() => `client_messages_collapsed_v1_${authStore.user?.id || 'anon'}_${props.client?.id || '0'}`);
const loadMessagesCollapsed = () => {
  try {
    const raw = localStorage.getItem(messagesCollapsedKey.value);
    messagesCollapsed.value = raw === 'true';
  } catch {
    messagesCollapsed.value = false;
  }
};
const toggleMessagesCollapsed = () => {
  messagesCollapsed.value = !messagesCollapsed.value;
  try {
    localStorage.setItem(messagesCollapsedKey.value, String(messagesCollapsed.value));
  } catch {
    // ignore
  }
};

const showAdminNoteModal = ref(false);
const openAdminNoteModal = async () => {
  if (!isBackofficeRole.value) return;
  showAdminNoteModal.value = true;
  await fetchAdminNote();
};
const closeAdminNoteModal = () => {
  showAdminNoteModal.value = false;
};

const hasAgencyAccess = ref(false);
const myAgencies = ref([]);

// Multi-agency (client may be affiliated with multiple agencies)
const clientAgencyAffiliations = ref([]);
const selectedAgencyId = ref('');
const switchingAgency = ref(false);

const switchableAgencies = computed(() => {
  const mine = new Set((myAgencies.value || []).map((a) => Number(a?.id)).filter(Boolean));
  const fromClient = (clientAgencyAffiliations.value || []).map((a) => ({
    id: Number(a?.agency_id),
    name: String(a?.agency_name || '').trim()
  })).filter((a) => a.id && a.name);

  // If the table isn't migrated yet, fall back to user's agencies for the client's current agency_id.
  if (!fromClient.length && props.client?.agency_id) {
    const match = (myAgencies.value || []).find((a) => Number(a?.id) === Number(props.client.agency_id)) || null;
    if (match?.id) return [{ id: Number(match.id), name: String(match.name || `Agency ${match.id}`) }];
  }

  return fromClient.filter((a) => mine.has(a.id));
});

const clientAgenciesNote = computed(() => {
  // If user isn't affiliated with the client’s agency (or the client is multi-agency),
  // show a small note to indicate other agency affiliation may exist.
  const rows = Array.isArray(clientAgencyAffiliations.value) ? clientAgencyAffiliations.value : [];
  if (!rows.length) return '';
  const mine = new Set((myAgencies.value || []).map((a) => Number(a?.id)).filter(Boolean));
  const clientAgencyIds = rows.map((r) => Number(r?.agency_id)).filter(Boolean);
  const mineCount = clientAgencyIds.filter((id) => mine.has(id)).length;
  if (mineCount > 0) {
    if (rows.length > mineCount) return 'Note: client is also affiliated with another agency.';
    return '';
  }
  // User has no agency overlap; show which agency owns the client.
  const names = rows.map((r) => String(r?.agency_name || '').trim()).filter(Boolean);
  if (names.length) return `Note: client is affiliated with another agency (${names.join(', ')}).`;
  return 'Note: client is affiliated with another agency.';
});

const addAgencyAffiliationId = ref('');
const addAgencyMakePrimary = ref(false);
const addableAgencyOptions = computed(() => {
  const existing = new Set((clientAgencyAffiliations.value || []).map((a) => Number(a?.agency_id)).filter(Boolean));
  return (myAgencies.value || []).filter((a) => a && !existing.has(Number(a.id)));
});

const addAgencyAffiliation = async () => {
  const agencyId = addAgencyAffiliationId.value ? Number(addAgencyAffiliationId.value) : null;
  if (!agencyId) return;
  const makePrimary = !!addAgencyMakePrimary.value;
  try {
    switchingAgency.value = true;
    await api.post(`/clients/${props.client.id}/agency-affiliations`, { agency_id: agencyId, is_primary: makePrimary });
    addAgencyAffiliationId.value = '';
    addAgencyMakePrimary.value = false;
    await fetchClientAgencyAffiliations();
    if (makePrimary) {
      // If we made it primary, props.client will be refreshed by parent; keep local selection consistent.
      selectedAgencyId.value = String(agencyId);
    }
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to add agency affiliation');
  } finally {
    switchingAgency.value = false;
  }
};

const removeAgencyAffiliation = async (agencyId) => {
  const id = Number(agencyId);
  if (!id) return;
  if (!window.confirm('Remove this agency affiliation?')) return;
  try {
    switchingAgency.value = true;
    await api.delete(`/clients/${props.client.id}/agency-affiliations/${id}`);
    await fetchClientAgencyAffiliations();
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to remove agency affiliation');
  } finally {
    switchingAgency.value = false;
  }
};

// Paperwork/document status history (dated)
const paperworkHistory = ref([]);
const paperworkHistoryLoading = ref(false);
const paperworkHistoryError = ref('');
const paperworkStatuses = ref([]);
const deliveryMethods = ref([]);
const paperworkError = ref('');
const savingPaperwork = ref(false);
const paperworkForm = ref({
  paperworkStatusId: '',
  deliveryMethodId: '',
  effectiveDate: new Date().toISOString().split('T')[0],
  roiExpiresAt: '',
  note: ''
});

// Document Status checklist (Needed/Received)
const docChecklistItems = ref([]);
const docChecklistLoading = ref(false);
const docChecklistSaving = ref(false);
const docChecklistError = ref('');
const docStatusDetailsEl = ref(null);

const docChecklistAvailable = computed(() => Array.isArray(docChecklistItems.value) && docChecklistItems.value.length > 0);
const docCompletedRow = computed(() => (docChecklistItems.value || []).find((x) => String(x?.status_key || '').toLowerCase() === 'completed') || null);
const docIsCompleted = computed(() => {
  const row = docCompletedRow.value;
  return !!row?.is_completed;
});
const docNeededOptions = computed(() => {
  return (docChecklistItems.value || []).filter((x) => String(x?.status_key || '').toLowerCase() !== 'completed');
});

const onMarkDocsCompletedFromOverview = async () => {
  if (!canEditPaperwork.value) return;
  const updated = await markAllDocsCompleted();
  if (updated && docStatusDetailsEl.value) {
    try {
      docStatusDetailsEl.value.open = false;
    } catch {
      // ignore
    }
  }
};

const documentStatusSummaryText = computed(() => {
  const count = props.client?.paperwork_needed_count;
  if (count === undefined || count === null) return '';
  const n = Number(count);
  if (!Number.isFinite(n)) return '';
  if (n <= 0) return 'Completed';
  if (n > 1) return 'Multiple Needed';
  const base = props.client?.paperwork_status_label || props.client?.paperwork_status_key || 'Needed';
  // If label is already something like 'New Docs', display 'New Docs Needed'
  const lbl = String(base || 'Needed').trim();
  return lbl ? `${lbl} Needed` : 'Needed';
});

const fetchDocChecklist = async () => {
  try {
    docChecklistLoading.value = true;
    docChecklistError.value = '';
    const r = await api.get(`/clients/${props.client.id}/document-status`);
    docChecklistItems.value = Array.isArray(r.data?.items) ? r.data.items : [];
  } catch (e) {
    docChecklistItems.value = [];
    docChecklistError.value = e?.response?.data?.error?.message || 'Failed to load document checklist';
  } finally {
    docChecklistLoading.value = false;
  }
};

const markAllDocsCompleted = async () => {
  if (!canEditPaperwork.value) return null;
  try {
    docChecklistSaving.value = true;
    docChecklistError.value = '';
    if (!docChecklistItems.value.length) {
      await fetchDocChecklist();
    }
    const items = (docChecklistItems.value || [])
      .filter((x) => String(x?.status_key || '').toLowerCase() !== 'completed')
      .filter((x) => Number(x?.paperwork_status_id) > 0);
    const updates = items.map((x) => ({
      paperwork_status_id: Number(x.paperwork_status_id),
      is_needed: false
    }));
    if (!updates.length) return null;

    const r = await api.put(`/clients/${props.client.id}/document-status`, { updates });
    await fetchDocChecklist();
    const updatedClient = r.data?.client || null;
    emit('updated', { keepOpen: true, client: updatedClient || undefined });
    return updatedClient;
  } catch (e) {
    docChecklistError.value = e?.response?.data?.error?.message || 'Failed to mark completed';
    return null;
  } finally {
    docChecklistSaving.value = false;
  }
};

const onToggleDocCompleted = async (event) => {
  if (!canEditPaperwork.value) return;
  const checked = !!event?.target?.checked;
  // "Completed" is derived from other items; allow only the "check" action which marks all received.
  if (!checked) return;
  await markAllDocsCompleted();
};

const onToggleDocNeeded = async (item, event) => {
  if (!canEditPaperwork.value) return;
  if (!item?.paperwork_status_id) return;
  if (String(item.status_key || '').toLowerCase() === 'completed') return;
  const checked = !!event?.target?.checked; // checked = Needed
  try {
    docChecklistSaving.value = true;
    docChecklistError.value = '';
    const r = await api.put(`/clients/${props.client.id}/document-status`, {
      paperwork_status_id: item.paperwork_status_id,
      is_needed: checked
    });
    // Refresh checklist and update the client summary in parent UI.
    await fetchDocChecklist();
    if (r.data?.client) {
      emit('updated', { client: r.data.client, keepOpen: true });
    } else {
      emit('updated', { keepOpen: true });
    }
  } catch (e) {
    docChecklistError.value = e?.response?.data?.error?.message || 'Failed to update document status';
  } finally {
    docChecklistSaving.value = false;
  }
};

// Multi-org + multi-provider assignments (backoffice only)
const affiliations = ref([]);
const affiliationsLoading = ref(false);
const assignmentsError = ref('');
const availableAffiliations = ref([]);
const addAffiliationOrgId = ref('');
const addAffiliationMakePrimary = ref(false);
const savingAffiliation = ref(false);

const selectedAssignmentOrgId = ref('');
const providerAssignments = ref([]);
const providerAssignmentsLoading = ref(false);
const providerOptions = ref([]);
const addProviderUserId = ref('');
const addProviderDay = ref('');
const addProviderMakePrimary = ref(true);
const savingProviderAssignment = ref(false);

const weekdayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Overview: show all (primary + secondary) providers across affiliations.
const overviewProviders = ref([]);
const overviewProvidersLoading = ref(false);

const refreshOverviewProviders = async () => {
  // Endpoint is backoffice-only; if the viewer can't access it, fall back to legacy single provider label.
  if (!isBackofficeRole.value || !hasAgencyAccess.value) {
    overviewProviders.value = [];
    overviewProvidersLoading.value = false;
    return;
  }
  const clientId = Number(props.client?.id);
  if (!clientId) {
    overviewProviders.value = [];
    overviewProvidersLoading.value = false;
    return;
  }
  try {
    overviewProvidersLoading.value = true;
    // No org filter: show all assigned providers (including secondary) across affiliations.
    const r = await api.get(`/clients/${clientId}/provider-assignments`);
    const rows = Array.isArray(r.data) ? r.data : [];
    // Sort by org, primary first, then provider name, then day.
    overviewProviders.value = rows.sort((a, b) => {
      const org = String(a?.organization_name || '').localeCompare(String(b?.organization_name || ''));
      if (org !== 0) return org;
      const ap = a?.is_primary ? 1 : 0;
      const bp = b?.is_primary ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const ln = String(a?.provider_last_name || '').localeCompare(String(b?.provider_last_name || ''));
      if (ln !== 0) return ln;
      const fn = String(a?.provider_first_name || '').localeCompare(String(b?.provider_first_name || ''));
      if (fn !== 0) return fn;
      return String(a?.service_day || '').localeCompare(String(b?.service_day || ''));
    });
  } catch {
    overviewProviders.value = [];
  } finally {
    overviewProvidersLoading.value = false;
  }
};

// Compliance checklist
const savingChecklist = ref(false);
const checklistAuditText = ref('');
const checklist = ref({
  parentsContactedAt: '',
  parentsContactedSuccessful: '',
  intakeAt: '',
  firstServiceAt: ''
});

// Guardians tab state (non-clinical portal access)
const guardiansLoading = ref(false);
const guardiansError = ref('');
const guardians = ref([]);
const showAddGuardianModal = ref(false);
const addingGuardian = ref(false);
const addGuardianForm = ref({
  email: '',
  firstName: '',
  lastName: '',
  relationshipTitle: 'Guardian',
  accessEnabled: true,
  permissions: {
    canViewDocs: true,
    canSignDocs: true,
    canViewLinks: true,
    canViewProgramMaterials: true,
    canViewProgress: true,
    canMessage: false
  }
});
const lastInviteLink = ref('');
const updatingGuardianId = ref(null);

const canManageGuardians = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support'].includes(r) && hasAgencyAccess.value;
});

const canEditPaperwork = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff'].includes(r) && hasAgencyAccess.value;
});

const selectedPaperworkStatusKey = computed(() => {
  const id = paperworkForm.value.paperworkStatusId ? Number(paperworkForm.value.paperworkStatusId) : null;
  if (!id) return '';
  const row = (paperworkStatuses.value || []).find((s) => Number(s?.id) === id) || null;
  return String(row?.status_key || row?.statusKey || '').toLowerCase();
});

const selectedOverviewPaperworkStatusKey = computed(() => {
  return '';
});

const availableAffiliationOptions = computed(() => {
  const existing = new Set((affiliations.value || []).map((a) => Number(a?.organization_id)).filter(Boolean));
  return (availableAffiliations.value || []).filter((o) => {
    const id = Number(o?.id);
    const t = String(o?.organization_type || 'agency').toLowerCase();
    if (!id) return false;
    if (t === 'agency') return false;
    return !existing.has(id);
  });
});

const canCreateInternalNotes = computed(() => {
  return hasAgencyAccess.value;
});

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = parseDateForDisplay(dateString);
  return date.toLocaleDateString();
};

const parseDateForDisplay = (dateValue) => {
  if (!dateValue) return new Date(0);
  const s = String(dateValue);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return new Date(y, m, d);
  }
  return new Date(s);
};

const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString();
};

const formatDocumentStatus = (status) => {
  const statusMap = {
    'NONE': 'None',
    'UPLOADED': 'Uploaded',
    'APPROVED': 'Approved',
    'REJECTED': 'Rejected'
  };
  return statusMap[status] || status;
};

const formatSource = (source) => {
  const sourceMap = {
    'BULK_IMPORT': 'Bulk Import',
    'SCHOOL_UPLOAD': 'School Upload',
    'DIGITAL_FORM': 'Digital Form',
    'ADMIN_CREATED': 'Admin Created'
  };
  return sourceMap[source] || source;
};

const formatFieldName = (field) => {
  const fieldMap = {
    'status': 'Status',
    'provider_id': 'Provider',
    'created': 'Created',
    'bulk_import_update': 'Bulk Import Update'
  };
  return fieldMap[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const isClientArchived = computed(() => String(props.client?.status || '').toUpperCase() === 'ARCHIVED');

// Admin Note (single internal note shown on Overview)
const adminNoteLoading = ref(false);
const adminNoteSaving = ref(false);
const adminNoteMessage = ref('');
const adminNoteDraft = ref('');
const adminNotePopoverOpen = ref(false);
let adminNoteCloseTimer = null;

const fetchAdminNote = async () => {
  if (!canViewAdminNote.value || !props.client?.id) return;
  try {
    adminNoteLoading.value = true;
    const r = await api.get(`/clients/${props.client.id}/admin-note`);
    adminNoteMessage.value = String(r.data?.note?.message || '').trim();
    adminNoteDraft.value = adminNoteMessage.value;
  } catch {
    adminNoteMessage.value = '';
    adminNoteDraft.value = '';
  } finally {
    adminNoteLoading.value = false;
  }
};

const openAdminNotePopover = () => {
  if (!canViewAdminNote.value) return;
  if (adminNoteCloseTimer) clearTimeout(adminNoteCloseTimer);
  adminNotePopoverOpen.value = true;
  if (!adminNoteMessage.value && !adminNoteDraft.value) {
    // Ensure draft is initialized (best-effort).
    adminNoteDraft.value = '';
  }
};

const closeAdminNotePopoverSoon = () => {
  if (adminNoteCloseTimer) clearTimeout(adminNoteCloseTimer);
  adminNoteCloseTimer = setTimeout(() => {
    adminNotePopoverOpen.value = false;
  }, 250);
};

const cancelCloseAdminNotePopover = () => {
  if (adminNoteCloseTimer) clearTimeout(adminNoteCloseTimer);
};

const closeAdminNotePopoverNow = () => {
  if (adminNoteCloseTimer) clearTimeout(adminNoteCloseTimer);
  adminNotePopoverOpen.value = false;
};

const saveAdminNote = async () => {
  if (!canViewAdminNote.value || !props.client?.id) return;
  const msg = String(adminNoteDraft.value || '').trim();
  if (!msg) return;
  try {
    adminNoteSaving.value = true;
    await api.put(`/clients/${props.client.id}/admin-note`, { message: msg });
    adminNoteMessage.value = msg;
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to save admin note');
  } finally {
    adminNoteSaving.value = false;
  }
};

const archiveClient = async () => {
  if (!canEditAccount.value) return;
  if (!confirm('Archive this client?')) return;
  try {
    await api.put(`/clients/${props.client.id}/status`, { status: 'ARCHIVED' });
    emit('updated');
  } catch (err) {
    console.error('Failed to archive client:', err);
    alert(err.response?.data?.error?.message || 'Failed to archive client');
  }
};

const unarchiveClient = async () => {
  if (!canEditAccount.value) return;
  try {
    await api.post(`/clients/${props.client.id}/unarchive`);
    emit('updated');
  } catch (err) {
    console.error('Failed to unarchive client:', err);
    alert(err.response?.data?.error?.message || 'Failed to unarchive client');
  }
};

const saveSkills = async () => {
  if (!canEditAccount.value) return;
  try {
    await api.put(`/clients/${props.client.id}`, { skills: !!skillsValue.value });
    // Refresh client payload so UI stays consistent without closing the panel.
    let refreshed = null;
    try {
      const r = await api.get(`/clients/${props.client.id}`);
      refreshed = r.data || null;
    } catch {
      // ignore
    }
    emit('updated', { keepOpen: true, client: refreshed });
  } catch (err) {
    console.error('Failed to update skills flag:', err);
    alert(err.response?.data?.error?.message || 'Failed to update skills flag');
    skillsValue.value = !!props.client?.skills;
  }
};

const hydrateOverviewForm = () => {
  overviewForm.value.initials = String(props.client?.initials || '');
  overviewForm.value.organization_id = props.client?.organization_id ? String(props.client.organization_id) : '';
  overviewForm.value.client_status_id = props.client?.client_status_id ? String(props.client.client_status_id) : '';
  overviewForm.value.submission_date = props.client?.submission_date ? String(props.client.submission_date).slice(0, 10) : '';
  overviewForm.value.insurance_type_id = props.client?.insurance_type_id ? String(props.client.insurance_type_id) : '';
  overviewForm.value.doc_date = props.client?.doc_date ? String(props.client.doc_date).slice(0, 10) : '';
  overviewForm.value.school_year = String(props.client?.school_year || '');
  overviewForm.value.grade = String(props.client?.grade || '');
  overviewForm.value.primary_client_language = String(props.client?.primary_client_language || '');
  overviewForm.value.primary_parent_language = String(props.client?.primary_parent_language || '');
  overviewForm.value.skills = !!props.client?.skills;
  overviewForm.value.referral_date = props.client?.referral_date ? String(props.client.referral_date).slice(0, 10) : '';
  overviewForm.value.source = String(props.client?.source || '');
};

const startEditOverview = () => {
  editingOverview.value = true;
  hydrateOverviewForm();
  loadOverviewOptions();
  fetchPaperworkStatuses();
};

const cancelEditOverview = () => {
  editingOverview.value = false;
  hydrateOverviewForm();
};

const saveOverview = async () => {
  if (!canEditAccount.value) return;
  try {
    savingOverview.value = true;
    const payload = {
      initials: String(overviewForm.value.initials || '').trim() || null,
      organization_id: overviewForm.value.organization_id ? Number(overviewForm.value.organization_id) : null,
      client_status_id: overviewForm.value.client_status_id ? Number(overviewForm.value.client_status_id) : null,
      submission_date: overviewForm.value.submission_date ? String(overviewForm.value.submission_date) : null,
      insurance_type_id: overviewForm.value.insurance_type_id ? Number(overviewForm.value.insurance_type_id) : null,
      doc_date: overviewForm.value.doc_date ? String(overviewForm.value.doc_date) : null,
      school_year: String(overviewForm.value.school_year || '').trim() || null,
      grade: String(overviewForm.value.grade || '').trim() || null,
      primary_client_language: String(overviewForm.value.primary_client_language || '').trim() || null,
      primary_parent_language: String(overviewForm.value.primary_parent_language || '').trim() || null,
      skills: !!overviewForm.value.skills,
      referral_date: overviewForm.value.referral_date ? String(overviewForm.value.referral_date) : null,
      source: String(overviewForm.value.source || '').trim() || null
    };
    await api.put(`/clients/${props.client.id}`, payload);
    const refreshed = (await api.get(`/clients/${props.client.id}`)).data || null;
    emit('updated', { keepOpen: true, client: refreshed });
    editingOverview.value = false;
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update client');
  } finally {
    savingOverview.value = false;
  }
};

const fetchHistory = async () => {
  try {
    historyLoading.value = true;
    historyError.value = '';
    const response = await api.get(`/clients/${props.client.id}/history`);
    history.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch history:', err);
    historyError.value = err.response?.data?.error?.message || 'Failed to load history';
  } finally {
    historyLoading.value = false;
  }
};

const fetchNotes = async () => {
  try {
    notesLoading.value = true;
    notesError.value = '';
    const response = await api.get(`/clients/${props.client.id}/notes`);
    notes.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch notes:', err);
    notesError.value = err.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    notesLoading.value = false;
  }
};

const fetchGuardians = async () => {
  if (!canManageGuardians.value) return;
  try {
    guardiansLoading.value = true;
    guardiansError.value = '';
    const resp = await api.get(`/clients/${props.client.id}/guardians`);
    guardians.value = resp.data || [];
  } catch (err) {
    guardiansError.value = err.response?.data?.error?.message || 'Failed to load guardians';
    guardians.value = [];
  } finally {
    guardiansLoading.value = false;
  }
};

const openAddGuardian = () => {
  lastInviteLink.value = '';
  addGuardianForm.value = {
    email: '',
    firstName: '',
    lastName: '',
    relationshipTitle: 'Guardian',
    accessEnabled: true,
    permissions: {
      canViewDocs: true,
      canSignDocs: true,
      canViewLinks: true,
      canViewProgramMaterials: true,
      canViewProgress: true,
      canMessage: false
    }
  };
  showAddGuardianModal.value = true;
};

const closeAddGuardian = () => {
  showAddGuardianModal.value = false;
};

const copyText = async (text) => {
  const t = String(text || '').trim();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
};

const addGuardian = async () => {
  if (!canManageGuardians.value) return;
  const email = String(addGuardianForm.value.email || '').trim();
  const firstName = String(addGuardianForm.value.firstName || '').trim();
  const lastName = String(addGuardianForm.value.lastName || '').trim();
  if (!email || !firstName || !lastName) return;
  try {
    addingGuardian.value = true;
    guardiansError.value = '';
    const resp = await api.post(`/clients/${props.client.id}/guardians`, {
      email,
      firstName,
      lastName,
      relationshipTitle: String(addGuardianForm.value.relationshipTitle || 'Guardian').trim() || 'Guardian',
      accessEnabled: addGuardianForm.value.accessEnabled !== false,
      permissionsJson: addGuardianForm.value.permissions
    });
    lastInviteLink.value = resp.data?.passwordlessTokenLink || '';
    await fetchGuardians();
  } catch (err) {
    guardiansError.value = err.response?.data?.error?.message || 'Failed to add guardian';
  } finally {
    addingGuardian.value = false;
  }
};

const updateGuardian = async (g) => {
  if (!canManageGuardians.value) return;
  const id = Number(g?.guardian_user_id);
  if (!id) return;
  try {
    updatingGuardianId.value = id;
    await api.patch(`/clients/${props.client.id}/guardians/${id}`, {
      relationshipTitle: String(g.relationship_title || 'Guardian').trim() || 'Guardian',
      accessEnabled: g.access_enabled === 1 || g.access_enabled === true
    });
    await fetchGuardians();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update guardian');
  } finally {
    updatingGuardianId.value = null;
  }
};

const removeGuardian = async (g) => {
  if (!canManageGuardians.value) return;
  const id = Number(g?.guardian_user_id);
  if (!id) return;
  if (!window.confirm('Remove this guardian’s access to this client?')) return;
  try {
    updatingGuardianId.value = id;
    await api.delete(`/clients/${props.client.id}/guardians/${id}`);
    await fetchGuardians();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to remove guardian');
  } finally {
    updatingGuardianId.value = null;
  }
};

const fetchAccess = async () => {
  try {
    const response = await api.get('/users/me/agencies');
    const agencies = response.data || [];
    myAgencies.value = Array.isArray(agencies) ? agencies : [];
    hasAgencyAccess.value = myAgencies.value.some((a) => Number(a.id) === Number(props.client.agency_id));
    // Keep selected agency synced to client's primary agency.
    selectedAgencyId.value = props.client?.agency_id ? String(props.client.agency_id) : '';
  } catch {
    hasAgencyAccess.value = false;
    myAgencies.value = [];
  }
};

const fetchClientAgencyAffiliations = async () => {
  try {
    const r = await api.get(`/clients/${props.client.id}/agency-affiliations`);
    clientAgencyAffiliations.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    clientAgencyAffiliations.value = [];
  }
};

const onSwitchAgency = async () => {
  const agencyId = selectedAgencyId.value ? Number(selectedAgencyId.value) : null;
  if (!agencyId || agencyId === Number(props.client?.agency_id)) return;
  try {
    switchingAgency.value = true;
    await api.post(`/clients/${props.client.id}/agency-affiliations`, { agency_id: agencyId, is_primary: true });
    const refreshed = await api.get(`/clients/${props.client.id}`);
    emit('updated', { keepOpen: true, client: refreshed.data });
    await fetchAccess();
    await fetchClientAgencyAffiliations();
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to switch agency');
    selectedAgencyId.value = props.client?.agency_id ? String(props.client.agency_id) : '';
  } finally {
    switchingAgency.value = false;
  }
};

watch([hasAgencyAccess, activeTab], async ([has, tab]) => {
  if (!has) return;
  if (tab !== 'phi') return;
  await fetchPaperworkStatuses();
  await fetchDeliveryMethods();
  await fetchPaperworkHistory();
});

const fetchPaperworkStatuses = async () => {
  if (!canEditPaperwork.value) {
    paperworkStatuses.value = [];
    return;
  }
  try {
    const agencyId = props.client?.agency_id ? Number(props.client.agency_id) : null;
    if (!agencyId) {
      paperworkStatuses.value = [];
      return;
    }
    const r = await api.get('/client-settings/paperwork-statuses', { params: { agencyId } });
    paperworkStatuses.value = (r.data || []).filter((s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true));
  } catch {
    paperworkStatuses.value = [];
  }
};

const fetchDeliveryMethods = async () => {
  if (!canEditPaperwork.value) {
    deliveryMethods.value = [];
    return;
  }
  try {
    const agencyId = props.client?.agency_id;
    const schoolId = props.client?.organization_id;
    if (!agencyId || !schoolId) {
      deliveryMethods.value = [];
      return;
    }
    const r = await api.get(`/school-settings/${schoolId}/paperwork-delivery-methods`, { params: { agencyId } });
    deliveryMethods.value = (r.data || []).filter((m) => m && (m.is_active === 1 || m.is_active === true));
  } catch {
    deliveryMethods.value = [];
  }
};

const fetchPaperworkHistory = async () => {
  if (!canEditPaperwork.value) {
    paperworkHistory.value = [];
    return;
  }
  try {
    paperworkHistoryLoading.value = true;
    paperworkHistoryError.value = '';
    const r = await api.get(`/clients/${props.client.id}/paperwork-history`);
    paperworkHistory.value = r.data || [];
  } catch (e) {
    paperworkHistoryError.value = e.response?.data?.error?.message || 'Failed to load document history';
    paperworkHistory.value = [];
  } finally {
    paperworkHistoryLoading.value = false;
  }
};

const fetchAvailableAffiliations = async () => {
  if (!canEditAccount.value) return;
  try {
    const agencyId = props.client?.agency_id;
    if (!agencyId) {
      availableAffiliations.value = [];
      return;
    }
    const r = await api.get(`/agencies/${agencyId}/affiliated-organizations`);
    availableAffiliations.value = r.data || [];
  } catch {
    availableAffiliations.value = [];
  }
};

const fetchClientAffiliations = async () => {
  if (!canEditAccount.value) return;
  try {
    affiliationsLoading.value = true;
    assignmentsError.value = '';
    const r = await api.get(`/clients/${props.client.id}/affiliations`);
    affiliations.value = r.data || [];
    if (!selectedAssignmentOrgId.value) {
      const primary = (affiliations.value || []).find((a) => a?.is_primary) || affiliations.value?.[0] || null;
      if (primary?.organization_id) selectedAssignmentOrgId.value = String(primary.organization_id);
    }
    // Keep the Overview provider list in sync with affiliations.
    await refreshOverviewProviders();
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to load affiliations';
    affiliations.value = [];
    overviewProviders.value = [];
  } finally {
    affiliationsLoading.value = false;
  }
};

const addAffiliation = async () => {
  if (!canEditAccount.value) return;
  const orgId = addAffiliationOrgId.value ? Number(addAffiliationOrgId.value) : null;
  if (!orgId) return;
  try {
    savingAffiliation.value = true;
    assignmentsError.value = '';
    await api.post(`/clients/${props.client.id}/affiliations`, { organization_id: orgId, is_primary: addAffiliationMakePrimary.value });
    addAffiliationOrgId.value = '';
    addAffiliationMakePrimary.value = false;
    await fetchClientAffiliations();
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to save affiliation';
  } finally {
    savingAffiliation.value = false;
  }
};

const setPrimaryAffiliation = async (orgId) => {
  if (!canEditAccount.value) return;
  const id = Number(orgId);
  if (!id) return;
  try {
    savingAffiliation.value = true;
    assignmentsError.value = '';
    await api.post(`/clients/${props.client.id}/affiliations`, { organization_id: id, is_primary: true });
    await fetchClientAffiliations();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to set primary';
  } finally {
    savingAffiliation.value = false;
  }
};

const removeAffiliation = async (orgId) => {
  if (!canEditAccount.value) return;
  const id = Number(orgId);
  if (!id) return;
  if (!window.confirm('Remove this affiliation? This will also remove any provider assignments for it.')) return;
  try {
    savingAffiliation.value = true;
    assignmentsError.value = '';
    await api.delete(`/clients/${props.client.id}/affiliations/${id}`);
    if (String(selectedAssignmentOrgId.value) === String(id)) selectedAssignmentOrgId.value = '';
    await fetchClientAffiliations();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to remove affiliation';
  } finally {
    savingAffiliation.value = false;
  }
};

const providerScheduleForSelectedOrg = ref([]);

const fetchProviderOptions = async () => {
  if (!canEditAccount.value) return;
  const agencyId = Number(props.client?.agency_id);
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  if (!agencyId || !orgId) {
    providerScheduleForSelectedOrg.value = [];
    providerOptions.value = [];
    return;
  }
  try {
    // Pull provider_school_assignments for this org (day/time rows) AND
    // also allow providers affiliated with the org but not scheduled yet (rare; supports day='Unknown').
    const [sched, aff] = await Promise.all([
      api.get('/provider-scheduling/assignments', { params: { agencyId, schoolOrganizationId: orgId } }),
      api.get('/provider-scheduling/affiliated-providers', { params: { agencyId, schoolOrganizationId: orgId } })
    ]);
    const rows = Array.isArray(sched.data) ? sched.data : [];
    providerScheduleForSelectedOrg.value = rows;

    const byProvider = new Map();
    for (const row of rows) {
      const pid = Number(row?.provider_user_id);
      if (!pid) continue;
      if (!byProvider.has(pid)) {
        byProvider.set(pid, {
          id: pid,
          first_name: row?.provider_first_name || '',
          last_name: row?.provider_last_name || ''
        });
      }
    }

    const affRows = Array.isArray(aff.data) ? aff.data : [];
    for (const p of affRows) {
      const pid = Number(p?.id);
      if (!pid) continue;
      if (!byProvider.has(pid)) {
        byProvider.set(pid, {
          id: pid,
          first_name: p?.first_name || '',
          last_name: p?.last_name || ''
        });
      }
    }
    providerOptions.value = Array.from(byProvider.values()).sort((a, b) =>
      String(a?.last_name || '').localeCompare(String(b?.last_name || '')) ||
      String(a?.first_name || '').localeCompare(String(b?.first_name || ''))
    );
  } catch {
    providerScheduleForSelectedOrg.value = [];
    providerOptions.value = [];
  }
};

const availableProviderDaysForSelectedOrg = computed(() => {
  const providerId = addProviderUserId.value ? Number(addProviderUserId.value) : null;
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  const out = [];
  // Unknown is always allowed.
  out.push('Unknown');
  if (!providerId || !orgId) return out;
  const rows = (providerScheduleForSelectedOrg.value || []).filter((r) => {
    return (
      Number(r?.provider_user_id) === providerId &&
      Number(r?.school_organization_id) === orgId &&
      (r?.is_active === 1 || r?.is_active === true)
    );
  });
  const days = new Set();
  for (const r of rows) {
    const day = String(r?.day_of_week || '').trim();
    const available = Number(r?.slots_available ?? 0);
    if (!day) continue;
    if (available <= 0) continue;
    days.add(day);
  }
  // Keep weekday ordering
  for (const d of weekdayOptions) {
    if (days.has(d)) out.push(d);
  }
  return out;
});

const reloadProviderAssignments = async () => {
  if (!canEditAccount.value) return;
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  if (!orgId) {
    providerAssignments.value = [];
    return;
  }
  try {
    providerAssignmentsLoading.value = true;
    assignmentsError.value = '';
    const r = await api.get(`/clients/${props.client.id}/provider-assignments`, { params: { organizationId: orgId } });
    providerAssignments.value = r.data || [];
    // Keep the Overview provider list in sync (across affiliations).
    await refreshOverviewProviders();
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to load provider assignments';
    providerAssignments.value = [];
  } finally {
    providerAssignmentsLoading.value = false;
  }
};

const addProviderAssignment = async () => {
  if (!canEditAccount.value) return;
  const orgId = selectedAssignmentOrgId.value ? Number(selectedAssignmentOrgId.value) : null;
  const providerUserId = addProviderUserId.value ? Number(addProviderUserId.value) : null;
  const day = String(addProviderDay.value || '').trim();
  if (!orgId || !providerUserId || !day) return;
  try {
    savingProviderAssignment.value = true;
    assignmentsError.value = '';
    await api.post(`/clients/${props.client.id}/provider-assignments`, {
      organization_id: orgId,
      provider_user_id: providerUserId,
      service_day: day,
      is_primary: addProviderMakePrimary.value === true
    });
    addProviderUserId.value = '';
    addProviderDay.value = '';
    addProviderMakePrimary.value = true;
    await reloadProviderAssignments();
    await refreshOverviewProviders();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to assign provider';
  } finally {
    savingProviderAssignment.value = false;
  }
};

const removeProviderAssignment = async (pa) => {
  if (!canEditAccount.value) return;
  const id = Number(pa?.id);
  if (!id) return;
  if (!window.confirm('Remove this provider assignment?')) return;
  try {
    savingProviderAssignment.value = true;
    assignmentsError.value = '';
    await api.delete(`/clients/${props.client.id}/provider-assignments/${id}`);
    await reloadProviderAssignments();
    await refreshOverviewProviders();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to remove assignment';
  } finally {
    savingProviderAssignment.value = false;
  }
};

const makePrimaryProvider = async (pa) => {
  if (!canEditAccount.value) return;
  const orgId = Number(pa?.organization_id);
  const providerUserId = Number(pa?.provider_user_id);
  const serviceDay = pa?.service_day ? String(pa.service_day) : 'Unknown';
  if (!orgId || !providerUserId) return;
  try {
    savingProviderAssignment.value = true;
    assignmentsError.value = '';
    await api.post(`/clients/${props.client.id}/provider-assignments`, {
      organization_id: orgId,
      provider_user_id: providerUserId,
      service_day: serviceDay || 'Unknown',
      is_primary: true
    });
    await reloadProviderAssignments();
    await refreshOverviewProviders();
    emit('updated', { keepOpen: true });
  } catch (e) {
    assignmentsError.value = e.response?.data?.error?.message || 'Failed to set primary provider';
  } finally {
    savingProviderAssignment.value = false;
  }
};

const savePaperworkHistory = async () => {
  if (!canEditPaperwork.value) return;
  const paperworkStatusId = paperworkForm.value.paperworkStatusId ? Number(paperworkForm.value.paperworkStatusId) : null;
  const effectiveDate = String(paperworkForm.value.effectiveDate || '').trim();
  if (!paperworkStatusId || !effectiveDate) return;
  const deliveryId = paperworkForm.value.deliveryMethodId ? Number(paperworkForm.value.deliveryMethodId) : null;
  const note = String(paperworkForm.value.note || '').trim() || null;
  const roiExpiresAt = String(paperworkForm.value.roiExpiresAt || '').trim() || null;
  try {
    savingPaperwork.value = true;
    paperworkError.value = '';
    await api.post(`/clients/${props.client.id}/paperwork-history`, {
      paperwork_status_id: paperworkStatusId,
      paperwork_delivery_method_id: deliveryId,
      effective_date: effectiveDate,
      roi_expires_at: selectedPaperworkStatusKey.value === 'roi' ? roiExpiresAt : null,
      note
    });
    paperworkForm.value.note = '';
    await fetchPaperworkHistory();
  } catch (e) {
    paperworkError.value = e.response?.data?.error?.message || 'Failed to save';
  } finally {
    savingPaperwork.value = false;
  }
};

const currentPaperworkSummary = computed(() => {
  const h = (paperworkHistory.value || [])[0] || null;
  const statusLabel = h?.paperwork_status_label || props.client?.paperwork_status_label || '—';
  const deliveryLabel =
    h?.paperwork_delivery_method_label ||
    props.client?.paperwork_delivery_method_label ||
    '—';
  const dateVal = h?.effective_date || props.client?.doc_date || null;
  const effectiveDateText = dateVal ? formatDate(dateVal) : '—';
  const roiExpiresAt = h?.roi_expires_at || props.client?.roi_expires_at || null;
  const statusKey = String(h?.paperwork_status_key || props.client?.paperwork_status_key || '').toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const roiExpired = statusKey === 'roi' && roiExpiresAt ? (new Date(String(roiExpiresAt)).getTime() < today.getTime()) : false;
  return {
    statusLabel: roiExpired ? 'ROI (Expired)' : statusLabel,
    deliveryLabel,
    effectiveDateText,
    roiExpiresAtText: roiExpiresAt ? formatDate(roiExpiresAt) : '',
    roiExpired
  };
});

const fetchProviders = async () => {
  try {
    const response = await api.get('/users');
    const allUsers = response.data || [];
    availableProviders.value = allUsers.filter(u => 
      ['provider', 'supervisor', 'admin'].includes(u.role?.toLowerCase())
    );
  } catch (err) {
    console.error('Failed to fetch providers:', err);
  }
};

const createNote = async () => {
  if (!newNoteMessage.value.trim()) return;

  try {
    creatingNote.value = true;
    await api.post(`/clients/${props.client.id}/notes`, {
      message: newNoteMessage.value.trim(),
      is_internal_only: false,
      category: newNoteCategory.value
    });
    newNoteMessage.value = '';
    newNoteCategory.value = 'general';
    await fetchNotes();
  } catch (err) {
    console.error('Failed to create note:', err);
    alert(err.response?.data?.error?.message || 'Failed to send message');
  } finally {
    creatingNote.value = false;
  }
};

const formatCategory = (c) => {
  const map = {
    general: 'General',
    status: 'Status',
    administrative: 'Admin',
    billing: 'Billing',
    clinical: 'Clinical'
  };
  return map[c] || c;
};

const handleClose = () => {
  emit('close');
};

watch(() => activeTab.value, (newTab) => {
  if (newTab === 'history' && history.value.length === 0) {
    fetchHistory();
  } else if (newTab === 'access' && accessLog.value.length === 0) {
    fetchAccessLog();
  } else if (newTab === 'checklist') {
    hydrateChecklist();
  } else if (newTab === 'messages' && notes.value.length === 0) {
    fetchNotes();
  } else if (newTab === 'guardians' && guardians.value.length === 0) {
    fetchGuardians();
  } else if (newTab === 'assignments') {
    fetchAvailableAffiliations();
    fetchClientAffiliations();
    fetchProviderOptions();
    reloadProviderAssignments();
  } else if (newTab === 'phi') {
    fetchDocChecklist();
    fetchPaperworkStatuses();
    fetchDeliveryMethods();
    fetchPaperworkHistory();
  }
});

watch(() => props.client, async () => {
  // Reset editing states when client changes
  editingStatus.value = false;
  skillsValue.value = !!props.client?.skills;
  if (!editingOverview.value) {
    hydrateOverviewForm();
  }
  loadOverviewOptions();
  fetchDocChecklist();
  await fetchClientAgencyAffiliations();
  await fetchAccess();
  await refreshOverviewProviders();
  await fetchAdminNote();
  loadMessagesCollapsed();
}, { deep: true, immediate: true });

const hydrateChecklist = async () => {
  try {
    const r = await api.get(`/clients/${props.client.id}`);
    const c = r.data || {};
    checklist.value.parentsContactedAt = c.parents_contacted_at ? String(c.parents_contacted_at).slice(0, 10) : '';
    checklist.value.parentsContactedSuccessful =
      c.parents_contacted_successful === null || c.parents_contacted_successful === undefined
        ? ''
        : (c.parents_contacted_successful ? 'true' : 'false');
    checklist.value.intakeAt = c.intake_at ? String(c.intake_at).slice(0, 10) : '';
    checklist.value.firstServiceAt = c.first_service_at ? String(c.first_service_at).slice(0, 10) : '';
    const who = c.checklist_updated_by_name || null;
    const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
    checklistAuditText.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
  } catch {
    // ignore
  }
};

const saveChecklist = async () => {
  try {
    savingChecklist.value = true;
    const payload = {
      parentsContactedAt: checklist.value.parentsContactedAt || null,
      parentsContactedSuccessful: checklist.value.parentsContactedSuccessful === '' ? null : (checklist.value.parentsContactedSuccessful === 'true'),
      intakeAt: checklist.value.intakeAt || null,
      firstServiceAt: checklist.value.firstServiceAt || null
    };
    const r = await api.put(`/clients/${props.client.id}/compliance-checklist`, payload);
    const c = r.data || {};
    const who = c.checklist_updated_by_name || null;
    const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
    checklistAuditText.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
    emit('updated');
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save checklist');
  } finally {
    savingChecklist.value = false;
  }
};

const canViewAccessLog = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff';
});

const formatAccessUser = (e) => {
  const name = `${e.user_first_name || ''} ${e.user_last_name || ''}`.trim();
  return name || e.user_email || `User ${e.user_id}`;
};

const fetchAccessLog = async () => {
  if (!canViewAccessLog.value) return;
  try {
    accessLoading.value = true;
    accessError.value = '';
    const r = await api.get(`/clients/${props.client.id}/access-log`);
    accessLog.value = r.data || [];
  } catch (e) {
    accessError.value = e.response?.data?.error?.message || 'Failed to load access log';
  } finally {
    accessLoading.value = false;
  }
};

onMounted(async () => {
  if (isBackofficeRole.value) {
    await fetchProviders();
  }
  await fetchAccess();
  await refreshOverviewProviders();
  await fetchAdminNote();
  if (activeTab.value === 'history') {
    await fetchHistory();
  } else if (activeTab.value === 'access') {
    await fetchAccessLog();
  } else if (activeTab.value === 'checklist') {
    await hydrateChecklist();
  } else if (activeTab.value === 'messages') {
    await fetchNotes();
  } else if (activeTab.value === 'guardians') {
    await fetchGuardians();
  } else if (activeTab.value === 'assignments') {
    await fetchAvailableAffiliations();
    await fetchClientAffiliations();
    await fetchProviderOptions();
    await reloadProviderAssignments();
  } else if (activeTab.value === 'phi') {
    await fetchPaperworkStatuses();
    await fetchDeliveryMethods();
    await fetchPaperworkHistory();
  }
});

// Open to a requested initial tab (e.g., ?tab=checklist)
watch(
  () => props.initialTab,
  (t) => {
    const desired = String(t || '').trim();
    if (!desired) return;
    const allowed = new Set((tabs.value || []).map((x) => x.id));
    if (allowed.has(desired)) activeTab.value = desired;
  },
  { immediate: true }
);

watch(
  () => selectedAssignmentOrgId.value,
  async () => {
    addProviderUserId.value = '';
    addProviderDay.value = '';
    addProviderMakePrimary.value = true;
    await reloadProviderAssignments();
    await fetchProviderOptions();
  }
);

watch(
  () => addProviderUserId.value,
  () => {
    // Reset day when provider changes so only valid days can be selected.
    addProviderDay.value = '';
  }
);
</script>

<style scoped>
.modal-content.large {
  /* Give more room for wide headers/tabs */
  width: min(1200px, 96vw);
}

.modal-tabs {
  /* Prevent tab header overflow; allow horizontal scroll */
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
}
.modal-tabs::-webkit-scrollbar {
  height: 10px;
}
.modal-tabs::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.15);
  border-radius: 999px;
}
.tab-button {
  display: inline-flex;
  flex: 0 0 auto;
}

.admin-note-item {
  position: relative;
}

.admin-note-trigger {
  position: relative;
  display: inline-block;
}

.admin-note-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 40;
  width: min(520px, 70vw);
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 10px 12px;
}

.admin-note-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg);
  resize: vertical;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content.large {
  background: white;
  border-radius: 12px;
  max-width: 900px;
  width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 2px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.btn-close:hover {
  color: var(--text-primary);
}

.modal-tabs {
  display: flex;
  gap: 8px;
  padding: 0 24px;
  border-bottom: 2px solid var(--border);
}

.tab-button {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--text-primary);
  background: var(--bg-alt);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 600;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-size: 14px;
}

.table th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  background: var(--bg-alt);
}

.table td.right,
.table th.right {
  text-align: right;
}

.table input[type="text"],
.table input[type="email"],
.table input[type="url"],
.table input[type="password"],
.table input[type="number"],
.table input[type="date"],
.table input[type="time"],
.table input[type="tel"],
.table input[type="search"],
.table input,
.form-group input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.form-group > label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.hint {
  font-size: 13px;
  color: var(--text-secondary);
}

.muted {
  color: var(--text-secondary);
  font-size: 13px;
}

.provider-list {
  display: grid;
  gap: 6px;
  margin-top: 2px;
}
.provider-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.detail-section {
  min-height: 400px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 15px;
  color: var(--text-primary);
}

.editable-field {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  display: inline-block;
}

.editable-field:hover {
  background: var(--bg-alt);
}

.edit-hint {
  font-size: 11px;
  color: var(--text-secondary);
  font-style: italic;
  margin-left: 8px;
}

.inline-select {
  padding: 6px 10px;
  border: 2px solid var(--primary);
  border-radius: 4px;
  font-size: 14px;
  background: white;
  min-width: 200px;
}

.doc-status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.doc-none {
  background: #e2e3e5;
  color: #383d41;
}

.doc-uploaded {
  background: #fff3cd;
  color: #856404;
}

.doc-approved {
  background: #d4edda;
  color: #155724;
}

.doc-rejected {
  background: #f8d7da;
  color: #721c24;
}

.quick-actions {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.quick-actions h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.actions-grid {
  display: flex;
  gap: 12px;
}

.status-select {
  min-width: 180px;
}

.history-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-item {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
  border-left: 3px solid var(--primary);
}

.history-time {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 150px;
}

.history-content {
  flex: 1;
}

.history-field {
  margin-bottom: 8px;
  color: var(--text-primary);
}

.history-change {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.from-value {
  color: var(--text-secondary);
  text-decoration: line-through;
}

.arrow {
  color: var(--primary);
  font-weight: 600;
}

.to-value {
  color: var(--text-primary);
  font-weight: 500;
}

.history-author {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.history-note {
  font-size: 13px;
  color: var(--text-primary);
  margin-top: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
  font-style: italic;
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.phi-warning {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.message-item {
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.message-item.internal-note {
  border-left: 3px solid var(--primary);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}

.message-author {
  font-weight: 600;
  color: var(--text-primary);
}

.message-date {
  color: var(--text-secondary);
  font-size: 12px;
}

.category-badge {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
}

.internal-badge {
  padding: 2px 8px;
  background: var(--primary);
  color: white;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.doc-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(99, 102, 241, 0.12);
  color: var(--primary);
}

.check-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.check-row:last-child {
  border-bottom: none;
}
.check-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 240px;
}
.check-label {
  font-weight: 600;
}
.check-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid rgba(0,0,0,0.08);
}
.badge-success {
  background: rgba(22, 163, 74, 0.12);
  color: #166534;
}
.badge-warning {
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
}
.badge-secondary {
  background: rgba(100, 116, 139, 0.12);
  color: #334155;
}

.message-content {
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.add-message-form {
  padding: 20px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.add-message-form h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.message-input {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 12px;
}

.message-options {
  margin-bottom: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.error {
  text-align: center;
  padding: 20px;
  color: #c33;
  background: #fee;
  border-radius: 6px;
}
</style>
