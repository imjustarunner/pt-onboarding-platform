<template>
  <div class="aip" data-testid="appointment-info-panel">
    <div class="aip-grid">
      <div class="aip-card">
        <span class="aip-ico aip-ico--blue" aria-hidden="true">◷</span>
        <div>
          <div class="aip-k">When</div>
          <div class="aip-v">{{ whenDateLabel || whenLabel || '—' }}</div>
          <div v-if="whenTimeLabel" class="aip-sub">{{ whenTimeLabel }}</div>
        </div>
      </div>
      <div class="aip-card">
        <span class="aip-ico aip-ico--indigo" aria-hidden="true">📁</span>
        <div>
          <div class="aip-k">Type</div>
          <div class="aip-v">{{ typeLabel || '—' }}</div>
        </div>
      </div>
      <div class="aip-card">
        <span class="aip-ico aip-ico--green" aria-hidden="true">●</span>
        <div>
          <div class="aip-k">Status</div>
          <div class="aip-v aip-status-row">
            <span>{{ statusPretty }}</span>
            <span v-if="statusLabel" class="aip-badge">{{ statusPretty }}</span>
          </div>
        </div>
      </div>
      <div class="aip-card">
        <span class="aip-ico aip-ico--violet" aria-hidden="true">▣</span>
        <div>
          <div class="aip-k">Modality</div>
          <div class="aip-v">{{ modalityLabel || '—' }}</div>
        </div>
      </div>
      <div class="aip-card">
        <span class="aip-ico aip-ico--purple" aria-hidden="true">⌂</span>
        <div>
          <div class="aip-k">Tenant</div>
          <div class="aip-v aip-tenant">
            <img v-if="tenantIconUrl" class="aip-tenant-logo" :src="tenantIconUrl" alt="" />
            <span>{{ tenantLabel || '—' }}</span>
          </div>
        </div>
      </div>
      <div class="aip-card">
        <span class="aip-ico aip-ico--amber" aria-hidden="true">👤</span>
        <div>
          <div class="aip-k">{{ providerLabel }}</div>
          <div class="aip-v">
            <button
              v-if="providerUserId && canOpenProvider"
              type="button"
              class="aip-link"
              @click="emit('open-provider', providerUserId)"
            >
              {{ providerName || `User #${providerUserId}` }}
            </button>
            <span v-else>{{ providerName || '—' }}</span>
          </div>
        </div>
      </div>
      <div v-if="clientId || clientName" class="aip-card">
        <span class="aip-ico aip-ico--sky" aria-hidden="true">◎</span>
        <div>
          <div class="aip-k">Client</div>
          <div class="aip-v">
            <button
              v-if="clientId && canOpenClient"
              type="button"
              class="aip-link"
              @click="emit('open-client', clientId)"
            >
              {{ clientName || `Client #${clientId}` }}
            </button>
            <span v-else>{{ clientName || '—' }}</span>
          </div>
        </div>
      </div>
      <div v-if="serviceLabel" class="aip-card">
        <span class="aip-ico aip-ico--teal" aria-hidden="true">✦</span>
        <div>
          <div class="aip-k">Service</div>
          <div class="aip-v">{{ serviceLabel }}</div>
        </div>
      </div>

      <div
        v-if="presenterNames.length"
        class="aip-card aip-card--presenters"
      >
        <span class="aip-ico aip-ico--rose" aria-hidden="true">◈</span>
        <div>
          <div class="aip-k">{{ presenterNames.length > 1 ? 'Presenters' : 'Presenter' }}</div>
          <div class="aip-v aip-presenter-names">
            <span
              v-for="(name, idx) in presenterNames"
              :key="`aip-pres-${idx}`"
              class="aip-presenter-chip"
            >
              <span class="aip-presenter-badge">PRESENTER</span>
              {{ name }}
            </span>
          </div>
        </div>
      </div>

      <div
        v-if="participantSummary || participantNames.length"
        class="aip-card aip-card--participants"
      >
        <span class="aip-ico aip-ico--amber" aria-hidden="true">👥</span>
        <div class="aip-participants">
          <div class="aip-k">{{ participantLabel }}</div>
          <div class="aip-v aip-participants-summary">{{ participantDisplaySummary }}</div>
          <button
            v-if="canExpandParticipants"
            type="button"
            class="aip-expand-btn"
            @click="participantsExpanded = !participantsExpanded"
          >
            {{ participantsExpanded ? 'Hide list' : `Show all ${participantNames.length}` }}
          </button>
          <ul v-if="participantsExpanded && participantNames.length" class="aip-participants-list">
            <li v-for="(name, idx) in participantNames" :key="`aip-p-${idx}`">
              <span>{{ name }}</span>
              <span v-if="isPresenterName(name)" class="aip-presenter-badge">PRESENTER</span>
            </li>
          </ul>
        </div>
      </div>

      <div
        v-if="virtualLink && showVirtualLink"
        class="aip-card"
        :class="{ 'aip-card--wide': !compactVirtualLink }"
      >
        <span class="aip-ico aip-ico--violet" aria-hidden="true">↗</span>
        <div>
          <div class="aip-k">Join link</div>
          <div v-if="compactVirtualLink" class="aip-v aip-inline-link">
            <a
              :href="virtualLink"
              target="_blank"
              rel="noopener noreferrer"
              class="aip-inline-btn aip-inline-btn--join"
            >
              Join
            </a>
            <button
              type="button"
              class="aip-inline-btn"
              :title="copiedLink ? 'Copied' : 'Copy join link'"
              @click="copyVirtualLink"
            >
              {{ copiedLink ? 'Copied' : 'Copy link' }}
            </button>
          </div>
          <div v-else class="aip-v">
            <a :href="virtualLink" target="_blank" rel="noopener noreferrer" class="aip-link">{{ virtualLink }}</a>
          </div>
        </div>
      </div>
      <div v-if="locationLabel" class="aip-card">
        <span class="aip-ico aip-ico--slate" aria-hidden="true">⌖</span>
        <div>
          <div class="aip-k">Location</div>
          <div class="aip-v">{{ locationLabel }}</div>
        </div>
      </div>
      <div v-if="roomLabel" class="aip-card">
        <span class="aip-ico aip-ico--slate" aria-hidden="true">▢</span>
        <div>
          <div class="aip-k">Room</div>
          <div class="aip-v">{{ roomLabel }}</div>
        </div>
      </div>
      <div v-if="notes && showNotes" class="aip-card aip-card--wide">
        <span class="aip-ico aip-ico--slate" aria-hidden="true">✎</span>
        <div>
          <div class="aip-k">Notes</div>
          <div class="aip-v aip-notes">{{ notes }}</div>
        </div>
      </div>

      <button type="button" class="aip-card aip-card--action" @click="emit('edit')">
        <span class="aip-ico aip-ico--violet" aria-hidden="true">✎</span>
        <div>
          <div class="aip-k">Edit appointment</div>
          <div class="aip-v">Change date, time or details</div>
        </div>
      </button>
      <button
        v-if="showBilling"
        type="button"
        class="aip-card aip-card--action"
        :disabled="!claimId && !clinicalSessionId"
        @click="emit('open-billing')"
      >
        <span class="aip-ico aip-ico--blue" aria-hidden="true">$</span>
        <div>
          <div class="aip-k">{{ claimId ? 'Open claim' : 'Billing / claim' }}</div>
          <div class="aip-v">Create or manage claim</div>
        </div>
      </button>
      <button
        v-if="showClinical"
        type="button"
        class="aip-card aip-card--action"
        :disabled="!clinicalNoteId && !clinicalSessionId"
        @click="emit('open-clinical')"
      >
        <span class="aip-ico aip-ico--green" aria-hidden="true">☰</span>
        <div>
          <div class="aip-k">Clinical notes</div>
          <div class="aip-v">View or add notes</div>
        </div>
      </button>
      <button
        v-if="showJoinQuick"
        type="button"
        class="aip-card aip-card--action"
        :disabled="joinBusy"
        @click="emit('join')"
      >
        <span class="aip-ico aip-ico--violet" aria-hidden="true">↗</span>
        <div>
          <div class="aip-k">{{ joinBusy ? 'Joining…' : 'Join session' }}</div>
          <div class="aip-v">Start or open the virtual room</div>
        </div>
      </button>
      <button
        v-if="showNoteQuick"
        type="button"
        class="aip-card aip-card--action"
        @click="emit('open-note')"
      >
        <span class="aip-ico aip-ico--green" aria-hidden="true">✎</span>
        <div>
          <div class="aip-k">Supervision note</div>
          <div class="aip-v">Short note, transcript &amp; summary</div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  whenLabel: { type: String, default: '' },
  whenDateLabel: { type: String, default: '' },
  whenTimeLabel: { type: String, default: '' },
  typeLabel: { type: String, default: '' },
  statusLabel: { type: String, default: '' },
  modalityLabel: { type: String, default: '' },
  tenantLabel: { type: String, default: '' },
  tenantIconUrl: { type: String, default: '' },
  providerLabel: { type: String, default: 'Provider' },
  providerName: { type: String, default: '' },
  providerUserId: { type: Number, default: 0 },
  canOpenProvider: { type: Boolean, default: false },
  clientId: { type: Number, default: 0 },
  clientName: { type: String, default: '' },
  canOpenClient: { type: Boolean, default: false },
  participantLabel: { type: String, default: 'Participants' },
  participantSummary: { type: String, default: '' },
  /** Full name list for expandable participants (meetings / group supervision). */
  participantNames: { type: Array, default: () => [] },
  expandableParticipants: { type: Boolean, default: false },
  /** Presenter display names for supervision info. */
  presenterNames: { type: Array, default: () => [] },
  serviceLabel: { type: String, default: '' },
  locationLabel: { type: String, default: '' },
  roomLabel: { type: String, default: '' },
  virtualLink: { type: String, default: '' },
  notes: { type: String, default: '' },
  showNotes: { type: Boolean, default: true },
  showVirtualLink: { type: Boolean, default: true },
  compactVirtualLink: { type: Boolean, default: false },
  showJoinQuick: { type: Boolean, default: false },
  joinBusy: { type: Boolean, default: false },
  showNoteQuick: { type: Boolean, default: false },
  showBilling: { type: Boolean, default: false },
  showClinical: { type: Boolean, default: false },
  claimId: { type: [Number, String], default: 0 },
  clinicalSessionId: { type: [Number, String], default: 0 },
  clinicalNoteId: { type: [Number, String], default: 0 }
});

const emit = defineEmits(['edit', 'open-provider', 'open-client', 'open-billing', 'open-clinical', 'open-note', 'join']);

const participantsExpanded = ref(false);

const statusPretty = computed(() => {
  const s = String(props.statusLabel || '').trim();
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
});

/** Show up to 5 names inline; beyond that collapse to "N people" with expand. */
const PARTICIPANT_SUMMARY_MAX = 5;

const canExpandParticipants = computed(() => (
  !!props.expandableParticipants && (props.participantNames || []).length > PARTICIPANT_SUMMARY_MAX
));

const presenterNameSet = computed(() => new Set(
  (props.presenterNames || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean)
));

function isPresenterName(name) {
  return presenterNameSet.value.has(String(name || '').trim().toLowerCase());
}

const participantDisplaySummary = computed(() => {
  const names = (props.participantNames || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (!names.length) return props.participantSummary || 'None selected';
  if (!props.expandableParticipants || names.length <= PARTICIPANT_SUMMARY_MAX) {
    return names.join(', ');
  }
  if (participantsExpanded.value) return `${names.length} people`;
  return `${names.length} people`;
});

const copiedLink = ref(false);
let copiedTimer = null;

async function copyVirtualLink() {
  const text = String(props.virtualLink || '').trim();
  if (!text) return;
  try {
    await navigator.clipboard?.writeText(text);
    copiedLink.value = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copiedLink.value = false; }, 1800);
  } catch {
    // ignore — clipboard may be blocked
  }
}
</script>

<style scoped>
.aip { display: flex; flex-direction: column; gap: 14px; }
.aip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.aip-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-width: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}
.aip-card--wide { grid-column: 1 / -1; }
.aip-card--participants {
  min-height: 72px;
}
.aip-participants {
  min-width: 0;
  flex: 1;
}
.aip-participants-summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.aip-expand-btn {
  appearance: none;
  border: none;
  background: none;
  padding: 4px 0 0;
  color: #4338ca;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.aip-expand-btn:hover { text-decoration: underline; }
.aip-participants-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  max-height: 140px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.aip-participants-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  padding: 4px 8px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
}
.aip-ico--rose { background: #ffe4e6; color: #be123c; }
.aip-presenter-names {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.aip-presenter-chip {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.aip-presenter-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: #9f1239;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  line-height: 1.2;
  flex: 0 0 auto;
}
.aip-tenant {
  display: flex;
  align-items: center;
  gap: 8px;
}
.aip-tenant-logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: contain;
  background: #fff;
  border: 1px solid #e2e8f0;
  flex: 0 0 auto;
}
.aip-ico {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 800;
  background: #e2e8f0;
  color: #334155;
}
.aip-ico--blue { background: #dbeafe; color: #1d4ed8; }
.aip-ico--indigo { background: #e0e7ff; color: #4338ca; }
.aip-ico--green { background: #dcfce7; color: #15803d; }
.aip-ico--violet { background: #ede9fe; color: #6d28d9; }
.aip-ico--purple { background: #f3e8ff; color: #7e22ce; }
.aip-ico--amber { background: #ffedd5; color: #c2410c; }
.aip-ico--sky { background: #e0f2fe; color: #0369a1; }
.aip-ico--teal { background: #ccfbf1; color: #0f766e; }
.aip-ico--slate { background: #e2e8f0; color: #475569; }
.aip-k {
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 2px;
}
.aip-v {
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
  word-break: break-word;
}
.aip-sub {
  margin-top: 2px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
}
.aip-status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.aip-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 0.72rem;
  font-weight: 800;
}
.aip-inline-link {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.aip-inline-btn {
  appearance: none;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #4338ca;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1.2;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}
.aip-inline-btn:hover {
  background: #e0e7ff;
  border-color: #a5b4fc;
}
.aip-inline-btn--join {
  background: #ede9fe;
  color: #6d28d9;
  border-color: #c4b5fd;
}
.aip-inline-btn--join:hover {
  background: #ddd6fe;
}
.aip-notes {
  font-weight: 500;
  white-space: pre-wrap;
  color: #334155;
}
.aip-card--action {
  appearance: none;
  font: inherit;
  color: inherit;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.aip-card--action:hover:not(:disabled) {
  border-color: #c7d2fe;
  background: #fff;
}
.aip-card--action:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}
.aip-card--action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.aip-card--action .aip-v {
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
}
.aip-link {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  color: #1d4ed8;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  word-break: break-all;
}
@media (max-width: 720px) {
  .aip-grid { grid-template-columns: 1fr; }
}
</style>
