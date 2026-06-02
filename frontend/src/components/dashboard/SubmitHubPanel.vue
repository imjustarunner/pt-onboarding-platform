<template>
  <div class="submit-hub">
    <header class="submit-hub__header">
      <div class="submit-hub__header-left">
        <div class="submit-hub__title-row">
          <span class="submit-hub__title-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <h2 class="submit-hub__title">{{ panelTitle }}</h2>
        </div>
        <p class="submit-hub__subtitle">{{ panelSubtitle }}</p>
      </div>
      <div class="submit-hub__header-actions">
        <button
          v-if="showBack"
          type="button"
          class="submit-hub__btn submit-hub__btn--ghost"
          @click="$emit('back')"
        >
          ← Back
        </button>
      </div>
    </header>

    <div v-if="view === 'root'" class="submit-hub__stats">
      <div class="submit-hub__stat">
        <div class="submit-hub__stat-icon submit-hub__stat-icon--green">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <div>
          <div class="submit-hub__stat-value">{{ visibleActionCount }}</div>
          <div class="submit-hub__stat-label">Ways to submit</div>
          <div class="submit-hub__stat-hint">Available for you</div>
        </div>
      </div>
      <div class="submit-hub__stat">
        <div class="submit-hub__stat-icon submit-hub__stat-icon--teal">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 7v10a2 2 0 0 0 2 2h16v-5"/></svg>
        </div>
        <div>
          <div class="submit-hub__stat-value">Payroll</div>
          <div class="submit-hub__stat-label">Claims & PTO</div>
          <div class="submit-hub__stat-hint">Mileage, receipts, time off</div>
        </div>
      </div>
      <div class="submit-hub__stat">
        <div class="submit-hub__stat-icon submit-hub__stat-icon--purple">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div>
          <div class="submit-hub__stat-value">Time</div>
          <div class="submit-hub__stat-label">Hours & schedule</div>
          <div class="submit-hub__stat-hint">Claims & availability</div>
        </div>
      </div>
      <div class="submit-hub__stat">
        <div class="submit-hub__stat-icon submit-hub__stat-icon--blue">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>
        </div>
        <div>
          <div class="submit-hub__stat-value">School</div>
          <div class="submit-hub__stat-label">In-school</div>
          <div class="submit-hub__stat-hint">When assigned</div>
        </div>
      </div>
    </div>

    <div v-if="view === 'root' && showInfoBanner" class="submit-hub__banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <p>Pick a category below to submit mileage, PTO, time claims, availability, and more. Track status under <strong>My Payroll</strong>.</p>
      <button type="button" class="submit-hub__banner-close" aria-label="Dismiss" @click="showInfoBanner = false">×</button>
    </div>

    <slot />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  view: { type: String, default: 'root' },
  visibleActionCount: { type: Number, default: 0 },
});

defineEmits(['back']);

const showInfoBanner = ref(true);

const showBack = computed(() => props.view !== 'root');

const panelTitle = computed(() => {
  const titles = {
    time: 'Time claims',
    in_school: 'In-school claims',
    availability: 'Additional availability',
    virtual_hours: 'Virtual working hours',
    company_car: 'Company car mileage',
  };
  return titles[props.view] || 'Submit';
});

const panelSubtitle = computed(() => {
  const subs = {
    time: 'Choose the type of time claim to submit for payroll review.',
    in_school: 'School mileage and missed Medicaid session claims.',
    availability: 'Submit office or school availability for your organization.',
    virtual_hours: 'Set weekly virtual hours not tied to a specific room.',
    company_car: 'Log and track business vehicle trips.',
  };
  return subs[props.view] || 'Submit mileage, PTO, time claims, and other requests for payroll review.';
});
</script>

<style scoped>
.submit-hub {
  --hub-green: #166534;
  --hub-border: #e5e7eb;
  --hub-muted: #6b7280;
  font-family: var(--font-body, 'Inter', system-ui, sans-serif);
  color: #111827;
}

.submit-hub__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}

.submit-hub__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.submit-hub__title-icon {
  display: flex;
  color: var(--hub-green);
}

.submit-hub__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.submit-hub__subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--hub-muted);
  max-width: 560px;
  line-height: 1.5;
}

.submit-hub__btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.submit-hub__btn--ghost {
  background: #fff;
  color: #374151;
  border: 1px solid var(--hub-border);
}

.submit-hub__btn--ghost:hover {
  background: #f9fafb;
}

.submit-hub__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 1100px) {
  .submit-hub__stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 520px) {
  .submit-hub__stats {
    grid-template-columns: 1fr;
  }
}

.submit-hub__stat {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px 20px;
  background: #fff;
  border: 1px solid var(--hub-border);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.submit-hub__stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.submit-hub__stat-icon--green {
  background: #dcfce7;
  color: var(--hub-green);
}
.submit-hub__stat-icon--teal {
  background: #ccfbf1;
  color: #0f766e;
}
.submit-hub__stat-icon--purple {
  background: #f3e8ff;
  color: #7c3aed;
}
.submit-hub__stat-icon--blue {
  background: #dbeafe;
  color: #1d4ed8;
}

.submit-hub__stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.submit-hub__stat-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-top: 2px;
}

.submit-hub__stat-hint {
  font-size: 12px;
  color: var(--hub-muted);
  margin-top: 2px;
}

.submit-hub__banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 20px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #166534;
  font-size: 14px;
  line-height: 1.5;
}

.submit-hub__banner p {
  margin: 0;
  flex: 1;
}

.submit-hub__banner-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
}
</style>
