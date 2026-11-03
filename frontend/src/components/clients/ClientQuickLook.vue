<template>
<transition name="cm-drawer">
      <div
        v-if="client"
        class="cm-drawer"
        :data-analytics-area="analyticsArea"
        tabindex="-1"
        @keydown.esc.stop="$emit('close')"
        @focusin="$emit('enter')"
        @focusout="$emit('leave')"
        :class="{ 'cm-drawer--pinned': pinned }"
        role="complementary"
        aria-label="Client detail panel"
        @mouseenter="$emit('enter')"
        @mouseleave="$emit('leave')"
      >
          <div class="cm-drawer-header">
            <div class="cm-drawer-avatar" :style="presentation.getInitialsStyle(client)">
              {{ presentation.getClientDisplay(client) }}
            </div>
            <div class="cm-drawer-title">
              <strong>{{ client.full_name || client.initials || `Client #${client.id}` }}</strong>
              <div class="cm-drawer-sub">
                <span v-if="client.identifier_code" class="cm-drawer-code"># {{ client.identifier_code }}</span>
                <span class="cm-status-pill" :style="presentation.getStatusPillStyle(client)">{{ presentation.formatClientStatus(client) }}</span>
                <span v-if="pinned" class="cm-drawer-pinned-badge" title="Pinned — click another row or ✕ to close">📌 Pinned</span>
              </div>
            </div>
            <div class="cm-drawer-actions">
              <button
                class="cm-drawer-open-btn"
                type="button"
                @click="$emit('open', client)"
                title="Open full profile page"
              >Full view ↗</button>
              <button class="cm-drawer-close" type="button" @click="$emit('close')" aria-label="Close">✕</button>
            </div>
          </div>
          <div class="cm-drawer-body">
            <!-- At a glance rows -->
            <div class="cm-drawer-rows">
              <div class="cm-drawer-row">
                <span class="cm-drawer-dt">Clinician</span>
                <span class="cm-drawer-dd">{{ client.provider_name || 'Unassigned' }}</span>
              </div>
              <div class="cm-drawer-row">
                <span class="cm-drawer-dt">Program</span>
                <span class="cm-drawer-dd">{{ client.client_type || '—' }}</span>
              </div>
              <div class="cm-drawer-row">
                <span class="cm-drawer-dt">Status</span>
                <span class="cm-drawer-dd">
                  <span class="cm-status-pill" :style="presentation.getStatusPillStyle(client)">{{ presentation.formatClientStatus(client) }}</span>
                </span>
              </div>
              <div class="cm-drawer-row">
                <span class="cm-drawer-dt">Affiliation</span>
                <span class="cm-drawer-dd">{{ presentation.affiliationDisplayLabel(client) }}</span>
              </div>
              <div class="cm-drawer-row">
                <span class="cm-drawer-dt">Since</span>
                <span class="cm-drawer-dd">
                  {{ presentation.formatDate(client.referral_date || client.submission_date) || '—' }}
                  <span v-if="client.source" class="cm-drawer-meta">{{ client.source }}</span>
                </span>
              </div>
              <div class="cm-drawer-row" v-if="client.insurance_type_label">
                <span class="cm-drawer-dt">Insurance</span>
                <span class="cm-drawer-dd">{{ client.insurance_type_label }}</span>
              </div>
              <div class="cm-drawer-row" v-if="client.date_of_birth">
                <span class="cm-drawer-dt">DOB</span>
                <span class="cm-drawer-dd">{{ presentation.formatDate(client.date_of_birth) }}</span>
              </div>
              <div class="cm-drawer-row">
                <span class="cm-drawer-dt">Documents</span>
                <span class="cm-drawer-dd">
                  <span class="cm-doc-status" :class="`cm-doc-${presentation.getDocumentStatusTone(client)}`">
                    {{ presentation.getDocumentStatusIcon(client) }} {{ presentation.formatDocumentStatusSummary(client) }}
                  </span>
                </span>
              </div>
              <div class="cm-drawer-row" v-if="client.last_activity_at">
                <span class="cm-drawer-dt">Last activity</span>
                <span class="cm-drawer-dd">{{ presentation.formatDate(client.last_activity_at) }}</span>
              </div>
              <!-- ROI & school-specific fields -->
              <div class="cm-drawer-row" v-if="client.roi_expires_at">
                <span class="cm-drawer-dt">ROI expires</span>
                <span class="cm-drawer-dd">
                  <span :class="presentation.roiExpiryClass(client)">{{ presentation.formatDate(client.roi_expires_at) }}</span>
                </span>
              </div>
              <div class="cm-drawer-row">
                <span class="cm-drawer-dt">Cleared</span>
                <span class="cm-drawer-dd">
                  <span class="cm-drawer-flag" :class="client.cleared_to_start ? 'cm-flag--yes' : 'cm-flag--no'">
                    {{ client.cleared_to_start ? '✓ Cleared' : '✗ Not cleared' }}
                  </span>
                </span>
              </div>
              <div class="cm-drawer-row">
                <span class="cm-drawer-dt">Portal</span>
                <span class="cm-drawer-dd">
                  <span class="cm-drawer-flag" :class="client.guardian_portal_enabled ? 'cm-flag--yes' : 'cm-flag--no'">
                    {{ client.guardian_portal_enabled ? '✓ Enabled' : '○ Disabled' }}
                  </span>
                </span>
              </div>
              <div class="cm-drawer-row" v-if="client.parents_contacted_at">
                <span class="cm-drawer-dt">Parents contacted</span>
                <span class="cm-drawer-dd">{{ presentation.formatDate(client.parents_contacted_at) }}</span>
              </div>
              <div class="cm-drawer-row" v-if="client.first_service_at">
                <span class="cm-drawer-dt">First service</span>
                <span class="cm-drawer-dd">{{ presentation.formatDate(client.first_service_at) }}</span>
              </div>
              <div class="cm-drawer-row" v-if="client.intake_at">
                <span class="cm-drawer-dt">Intake date</span>
                <span class="cm-drawer-dd">{{ presentation.formatDate(client.intake_at) }}</span>
              </div>
              <div class="cm-drawer-row" v-if="client.grade || client.school_year">
                <span class="cm-drawer-dt">Grade / Year</span>
                <span class="cm-drawer-dd">{{ client.grade || '—' }} / {{ client.school_year || '—' }}</span>
              </div>
              <div class="cm-drawer-row" v-if="client.service_day">
                <span class="cm-drawer-dt">Service day</span>
                <span class="cm-drawer-dd">{{ client.service_day }}</span>
              </div>
              <div class="cm-drawer-row" v-if="client.internal_notes">
                <span class="cm-drawer-dt">Notes</span>
                <span class="cm-drawer-dd cm-drawer-dd--notes">{{ client.internal_notes }}</span>
              </div>
            </div>
            <slot name="extra" :client="client" />
          </div>
          <!-- Quick actions footer -->
          <div class="cm-drawer-footer">
            <button
              class="cm-drawer-footer-btn cm-drawer-footer-btn--primary"
              type="button"
              @click="$emit('open', client)"
            >Open full profile ↗</button>
            <button
              v-if="canEdit"
              class="cm-drawer-footer-btn cm-drawer-footer-btn--secondary"
              type="button"
              @click="$emit('edit-status', client); $emit('close')"
              title="Quick-edit client status"
            >Edit status</button>
          </div>
        </div>
    </transition>
</template>
<script setup>
defineProps({client:{type:Object,default:null},pinned:{type:Boolean,default:false},canEdit:{type:Boolean,default:false},analyticsArea:{type:String,default:null},presentation:{type:Object,required:true}});
defineEmits(['open','close','edit-status','enter','leave']);
</script>
<style scoped>
/* Quick-view / pinned side panel */
.cm-drawer {
  position: fixed;
  top: var(--app-nav-height, 72px);
  right: 0;
  bottom: 0;
  width: min(420px, 92vw);
  height: calc(100vh - var(--app-nav-height, 72px));
  height: calc(100dvh - var(--app-nav-height, 72px));
  background: var(--app-surface, #fff);
  box-shadow: -4px 0 28px rgba(0, 0, 0, 0.13);
  z-index: 10200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid var(--border, #e5e7eb);
}
.cm-drawer--pinned {
  border-left: 3px solid #16a34a;
  box-shadow: -4px 0 36px rgba(22, 163, 74, 0.18);
}
.cm-drawer-pinned-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--app-text-green, #16a34a);
  background: var(--app-surface-muted, #f0fdf4);
  border: 1px solid var(--app-line, #bbf7d0);
  border-radius: 999px;
  padding: 1px 7px;
  letter-spacing: 0.01em;
}
.cm-drawer-footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border, #e5e7eb);
  background: var(--app-surface-muted, #fafafa);
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
.cm-drawer-footer-btn {
  flex: 1;
  padding: 0.45rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 7px;
  cursor: pointer;
  border: 1px solid;
  transition: background 0.15s;
}
.cm-drawer-footer-btn--primary {
  background: var(--primary, #2d6a4f);
  color: #fff;
  border-color: var(--primary, #2d6a4f);
}
.cm-drawer-footer-btn--primary:hover { background: #1e4e39; }
.cm-drawer-footer-btn--secondary {
  background: var(--app-surface, #fff);
  color: var(--app-ink, #374151);
  border-color: var(--app-line, #d1d5db);
}
.cm-drawer-footer-btn--secondary:hover { background: var(--app-surface-muted, #f9fafb); }
.cm-drawer-header {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid var(--border, #e5e7eb);
  position: sticky;
  top: 0;
  background: var(--app-surface, #fff);
}
.cm-drawer-avatar {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 999px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  font-weight: 700;
  flex-shrink: 0;
}
.cm-drawer-title {
  flex: 1;
  min-width: 0;
}
.cm-drawer-title strong {
  font-size: 0.96rem;
  display: block;
  margin-bottom: 0.3rem;
}
.cm-drawer-sub {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.cm-drawer-code {
  font-size: 0.78rem;
  color: var(--text-secondary, #6b7280);
}
.cm-drawer-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}
.cm-drawer-open-btn {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--primary, #2d6a4f);
  background: none;
  border: 1px solid var(--primary, #2d6a4f);
  border-radius: 7px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  white-space: nowrap;
}
.cm-drawer-open-btn:hover { background: var(--app-surface-muted, #f0fdf4); }
.cm-drawer-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-secondary, #6b7280);
  padding: 0.2rem;
  line-height: 1;
}
.cm-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
}
.cm-drawer-section {
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid var(--border, #f1f5f9);
}
.cm-drawer-section-title {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #94a3b8);
  margin-bottom: 0.5rem;
}
.cm-drawer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
}
.cm-drawer-label {
  display: block;
  font-size: 0.74rem;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 0.1rem;
}
/* At-a-glance rows in drawer */
.cm-drawer-rows {
  display: flex;
  flex-direction: column;
}
.cm-drawer-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  border-bottom: 1px solid var(--app-line, #f1f5f9);
}
.cm-drawer-row:last-child { border-bottom: none; }
.cm-drawer-dt {
  padding: 8px 10px 8px 14px;
  background: var(--app-surface-muted, #f8fafc);
  border-right: 1px solid var(--app-line, #f1f5f9);
  font-size: 11px;
  font-weight: 650;
  color: var(--app-muted, #64748b);
  display: flex;
  align-items: center;
}
.cm-drawer-dd {
  padding: 8px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-ink, #1e293b);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.cm-drawer-meta {
  font-size: 11px;
  color: var(--app-muted, #94a3b8);
  font-weight: 400;
}
.cm-drawer-dd--notes {
  font-size: 11.5px;
  font-weight: 400;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 80px;
  overflow-y: auto;
  color: var(--app-muted, #475569);
}
.cm-drawer-flag {
  font-size: 11.5px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
}
.cm-flag--yes { background: var(--app-tint-green, #dcfce7); color: var(--app-text-green, #15803d); }
.cm-flag--no  { background: var(--app-surface-muted, #f1f5f9); color: var(--app-muted, #64748b); }
.cm-roi--expired { color: var(--app-text-red, #dc2626); font-weight: 700; }
.cm-roi--soon    { color: var(--app-text-red, #f97316); font-weight: 700; }
.cm-roi--warn    { color: var(--app-text-red, #ca8a04); font-weight: 600; }
.cm-roi--ok      { color: var(--app-text-green, #15803d); }
/* Drawer transition */
.cm-drawer-enter-active,
.cm-drawer-leave-active {
  transition: transform 0.22s ease, opacity 0.18s ease;
}
.cm-drawer-enter-from,
.cm-drawer-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.cm-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.cm-doc-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}
.cm-doc-completed { color: var(--app-text-green, #027a48); }
.cm-doc-pending { color: var(--app-text-red, #b54708); }
.cm-doc-attention { color: var(--app-text-red, #b42318); }
.cm-doc-neutral { color: var(--app-muted, #475467); }
.cm-doc-icon {
  font-size: 12px;
  line-height: 1;
}
@media(prefers-reduced-motion:reduce){.cm-drawer-enter-active,.cm-drawer-leave-active{transition:none}}

</style>
