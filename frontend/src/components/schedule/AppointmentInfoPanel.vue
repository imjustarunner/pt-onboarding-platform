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
      <div v-if="participantSummary" class="aip-card aip-card--wide">
        <span class="aip-ico aip-ico--amber" aria-hidden="true">👥</span>
        <div>
          <div class="aip-k">{{ participantLabel }}</div>
          <div class="aip-v">{{ participantSummary }}</div>
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
      <div v-if="virtualLink && showVirtualLink" class="aip-card aip-card--wide">
        <span class="aip-ico aip-ico--violet" aria-hidden="true">↗</span>
        <div>
          <div class="aip-k">Join link</div>
          <div class="aip-v">
            <a :href="virtualLink" target="_blank" rel="noopener noreferrer" class="aip-link">{{ virtualLink }}</a>
          </div>
        </div>
      </div>
      <div v-if="notes && showNotes" class="aip-card aip-card--wide">
        <span class="aip-ico aip-ico--slate" aria-hidden="true">✎</span>
        <div>
          <div class="aip-k">Notes</div>
          <div class="aip-v aip-notes">{{ notes }}</div>
        </div>
      </div>
    </div>

    <div class="aip-quick">
      <button type="button" class="aip-quick-card" @click="emit('edit')">
        <span class="aip-quick-ico aip-quick-ico--violet">✎</span>
        <span>
          <strong>Edit appointment</strong>
          <em>Change date, time or details</em>
        </span>
      </button>
      <button
        v-if="showBilling"
        type="button"
        class="aip-quick-card"
        :disabled="!claimId && !clinicalSessionId"
        @click="emit('open-billing')"
      >
        <span class="aip-quick-ico aip-quick-ico--blue">$</span>
        <span>
          <strong>{{ claimId ? 'Open claim' : 'Billing / claim' }}</strong>
          <em>Create or manage claim</em>
        </span>
      </button>
      <button
        v-if="showClinical"
        type="button"
        class="aip-quick-card"
        :disabled="!clinicalNoteId && !clinicalSessionId"
        @click="emit('open-clinical')"
      >
        <span class="aip-quick-ico aip-quick-ico--green">☰</span>
        <span>
          <strong>Clinical notes</strong>
          <em>View or add notes</em>
        </span>
      </button>
      <button
        v-if="showNoteQuick"
        type="button"
        class="aip-quick-card"
        @click="emit('open-note')"
      >
        <span class="aip-quick-ico aip-quick-ico--green">✎</span>
        <span>
          <strong>Supervision note</strong>
          <em>Short note, transcript &amp; summary</em>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

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
  serviceLabel: { type: String, default: '' },
  locationLabel: { type: String, default: '' },
  roomLabel: { type: String, default: '' },
  virtualLink: { type: String, default: '' },
  notes: { type: String, default: '' },
  showNotes: { type: Boolean, default: true },
  showVirtualLink: { type: Boolean, default: true },
  showNoteQuick: { type: Boolean, default: false },
  showBilling: { type: Boolean, default: false },
  showClinical: { type: Boolean, default: false },
  claimId: { type: [Number, String], default: 0 },
  clinicalSessionId: { type: [Number, String], default: 0 },
  clinicalNoteId: { type: [Number, String], default: 0 }
});

const emit = defineEmits(['edit', 'open-provider', 'open-client', 'open-billing', 'open-clinical', 'open-note']);

const statusPretty = computed(() => {
  const s = String(props.statusLabel || '').trim();
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
});
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
.aip-notes {
  font-weight: 500;
  white-space: pre-wrap;
  color: #334155;
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
.aip-quick {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.aip-quick-card {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #e8eef5;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.aip-quick-card:hover:not(:disabled) {
  border-color: #c7d2fe;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.08);
}
.aip-quick-card:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.aip-quick-card strong {
  display: block;
  font-size: 0.86rem;
  color: #0f172a;
}
.aip-quick-card em {
  display: block;
  font-style: normal;
  font-size: 0.74rem;
  color: #64748b;
  margin-top: 2px;
}
.aip-quick-ico {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.95rem;
}
.aip-quick-ico--violet { background: #ede9fe; color: #6d28d9; }
.aip-quick-ico--blue { background: #dbeafe; color: #1d4ed8; }
.aip-quick-ico--green { background: #dcfce7; color: #15803d; }
@media (max-width: 720px) {
  .aip-grid,
  .aip-quick { grid-template-columns: 1fr; }
}
</style>
