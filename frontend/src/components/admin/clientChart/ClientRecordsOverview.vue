<template>
  <div class="cro">
    <div class="cro-head">
      <h3 class="cro-title">Record Center</h3>
      <p class="hint">Clinical notes, treatment plans, documents, billing, authorizations, and audit history for this client.</p>
    </div>

    <div v-if="phiBanner" class="phi-warning cro-phi-banner">
      <strong>PHI access</strong>
      <span class="muted"> Viewing protected health information is audited. Use only for care coordination.</span>
    </div>

    <div class="cro-grid">
      <button type="button" class="cro-card" @click="$emit('navigate', 'clinical-notes')">
        <span class="cro-card__kicker">Clinical Notes</span>
        <strong>Intake note &amp; sessions</strong>
        <span class="muted tiny">90791 / H0031 draft, medical record, diagnoses</span>
      </button>
      <button type="button" class="cro-card" @click="$emit('navigate', 'treatment-plans')">
        <span class="cro-card__kicker">Plans</span>
        <strong>Treatment plans</strong>
        <span class="muted tiny">Draft and active plans on chart</span>
      </button>
      <button type="button" class="cro-card" @click="$emit('navigate', 'documents')">
        <span class="cro-card__kicker">Documents</span>
        <strong>Signed docs &amp; packet</strong>
        <span class="muted tiny">Packet, summaries, intake answers</span>
      </button>
      <button
        v-if="canViewBilling"
        type="button"
        class="cro-card"
        @click="$emit('navigate', 'billing')"
      >
        <span class="cro-card__kicker">Billing</span>
        <strong>Billing &amp; claims</strong>
        <span class="muted tiny">Encounters and imported balances</span>
      </button>
      <button type="button" class="cro-card" @click="$emit('navigate', 'authorizations')">
        <span class="cro-card__kicker">Authorizations</span>
        <strong>ROI, HIPAA, disclosure</strong>
        <span class="muted tiny">Consents and care-team disclosure</span>
      </button>
      <button type="button" class="cro-card" @click="$emit('navigate', 'audit')">
        <span class="cro-card__kicker">Audit</span>
        <strong>Access &amp; audit trail</strong>
        <span class="muted tiny">Who viewed chart records</span>
      </button>
    </div>

    <div class="cro-secondary">
      <h4 class="cro-secondary__title">More on this chart</h4>
      <div class="cro-secondary__row">
        <button type="button" class="cdp-btn-soft" @click="$emit('navigate-secondary', 'surveys')">Surveys</button>
        <button type="button" class="cdp-btn-soft" @click="$emit('navigate-secondary', 'assessments')">Assessments</button>
        <button
          v-if="canManageSchoolRoi"
          type="button"
          class="cdp-btn-soft"
          @click="$emit('navigate', 'authorizations')"
        >
          School ROI
        </button>
        <button
          v-if="packagesEnabled"
          type="button"
          class="cdp-btn-soft"
          @click="$emit('navigate-secondary', 'packages')"
        >
          Packages
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  canViewClinical: { type: Boolean, default: false },
  canViewMedicalRecord: { type: Boolean, default: false },
  canViewBilling: { type: Boolean, default: false },
  canManageSchoolRoi: { type: Boolean, default: false },
  packagesEnabled: { type: Boolean, default: false },
  phiBanner: { type: Boolean, default: false }
});
defineEmits(['navigate', 'navigate-secondary']);
</script>

<style scoped>
.cro-head { margin-bottom: 14px; }
.cro-title { margin: 0 0 4px; font-size: 16px; font-weight: 750; color: var(--text-primary, #0f172a); }
.cro-phi-banner { margin-bottom: 14px; }
.cro-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.cro-card {
  text-align: left;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg-card, var(--bg, #fff));
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-primary, #0f172a);
}
.cro-card:hover {
  border-color: var(--primary, #166534);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.cro-card__kicker {
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
}
.cro-secondary {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.cro-secondary__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}
.cro-secondary__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
