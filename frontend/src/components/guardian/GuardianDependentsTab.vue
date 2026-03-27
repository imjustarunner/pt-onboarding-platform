<template>
  <div class="gdt">
    <div v-if="loading" class="gdt-hint">Loading dependents…</div>
    <div v-else-if="error" class="gdt-error">{{ error }}</div>
    <div v-else-if="!dependents.length" class="gdt-empty">
      No dependents on file. Children are linked to your account during program enrollment.
    </div>
    <div v-else class="gdt-list">
      <div v-for="dep in dependents" :key="dep.clientId" class="gdt-card">
        <!-- Header -->
        <div class="gdt-card-head">
          <div class="gdt-name">{{ dep.fullName || 'Unnamed child' }}</div>
          <div class="gdt-meta">
            <span v-if="dep.grade">Grade {{ dep.grade }}</span>
            <span v-if="dep.gender">{{ dep.gender }}</span>
            <span v-if="dep.relationshipType" class="gdt-rel">{{ dep.relationshipType }}</span>
          </div>
          <div v-if="dep.waiverUpdatedAt" class="gdt-waiver-date">
            Waivers last updated {{ formatDate(dep.waiverUpdatedAt) }}
          </div>
          <div v-else class="gdt-waiver-date muted">No waiver info on file yet</div>
        </div>

        <!-- Emergency Contacts -->
        <div class="gdt-section">
          <h5 class="gdt-section-title">Emergency contacts</h5>
          <div v-if="emergencyContacts(dep).length" class="gdt-contact-list">
            <div v-for="(c, i) in emergencyContacts(dep)" :key="i" class="gdt-contact-row">
              <span class="gdt-contact-name">{{ c.name || '—' }}</span>
              <span v-if="c.relationship" class="gdt-contact-rel">{{ c.relationship }}</span>
              <span v-if="c.phone" class="gdt-contact-phone">{{ c.phone }}</span>
            </div>
          </div>
          <div v-else class="gdt-none">Not on file</div>
        </div>

        <!-- Allergies & Medical -->
        <div class="gdt-section">
          <h5 class="gdt-section-title">Allergies &amp; medical notes</h5>
          <div v-if="dep.sections?.allergies_snacks" class="gdt-allergy-block">
            <div v-if="dep.sections.allergies_snacks.allergies" class="gdt-allergy-row">
              <span class="gdt-allergy-label">Allergies / medical:</span>
              <span>{{ dep.sections.allergies_snacks.allergies }}</span>
            </div>
            <div v-if="dep.sections.allergies_snacks.noSnacks" class="gdt-allergy-row gdt-allergy-row--warn">
              No snacks — do not give this child any snacks.
            </div>
            <div v-else-if="approvedSnacksSummary(dep)" class="gdt-allergy-row">
              <span class="gdt-allergy-label">Approved snacks:</span>
              <span>{{ approvedSnacksSummary(dep) }}</span>
            </div>
            <div v-if="dep.sections.allergies_snacks.notes" class="gdt-allergy-row">
              <span class="gdt-allergy-label">Other notes:</span>
              <span>{{ dep.sections.allergies_snacks.notes }}</span>
            </div>
          </div>
          <div v-else class="gdt-none">Not on file</div>
        </div>

        <!-- Pickup Authorization -->
        <div class="gdt-section">
          <h5 class="gdt-section-title">Authorized pickups</h5>
          <div v-if="authorizedPickups(dep).length" class="gdt-contact-list">
            <div v-for="(p, i) in authorizedPickups(dep)" :key="i" class="gdt-contact-row">
              <span class="gdt-contact-name">{{ p.name || '—' }}</span>
              <span v-if="p.relationship" class="gdt-contact-rel">{{ p.relationship }}</span>
              <span v-if="p.phone" class="gdt-contact-phone">{{ p.phone }}</span>
            </div>
          </div>
          <div v-else class="gdt-none">Not on file</div>
        </div>

        <!-- Meal Preferences -->
        <div v-if="dep.sections?.meal_preferences" class="gdt-section">
          <h5 class="gdt-section-title">Meal preferences</h5>
          <div class="gdt-allergy-block">
            <div v-if="dep.sections.meal_preferences.allowedMeals" class="gdt-allergy-row">
              <span class="gdt-allergy-label">Allowed:</span>
              <span>{{ dep.sections.meal_preferences.allowedMeals }}</span>
            </div>
            <div v-if="dep.sections.meal_preferences.restrictedMeals" class="gdt-allergy-row">
              <span class="gdt-allergy-label">Restricted:</span>
              <span>{{ dep.sections.meal_preferences.restrictedMeals }}</span>
            </div>
            <div v-if="dep.sections.meal_preferences.notes" class="gdt-allergy-row">
              <span class="gdt-allergy-label">Notes:</span>
              <span>{{ dep.sections.meal_preferences.notes }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="gdt-footer-notice">
      To update emergency contacts, allergies, or pickup authorizations, please contact the program
      administrator or re-enroll through a registration form to provide updated waiver information.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../utils/api.js';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  guardianUserId: { type: [Number, String], default: null }
});

const dependents = ref([]);
const loading = ref(false);
const error = ref('');

function emergencyContacts(dep) {
  return dep.sections?.emergency_contacts?.contacts || [];
}

function authorizedPickups(dep) {
  return dep.sections?.pickup_authorization?.authorizedPickups || [];
}

function approvedSnacksSummary(dep) {
  const s = dep.sections?.allergies_snacks;
  if (!s) return '';
  const list = Array.isArray(s.approvedSnacksList) && s.approvedSnacksList.length
    ? s.approvedSnacksList.join(', ')
    : '';
  const freeText = s.approvedSnacks ? String(s.approvedSnacks).trim() : '';
  return [list, freeText].filter(Boolean).join('; ');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function load() {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get('/guardian-billing/dependents-summary', {
      params: { agencyId: props.agencyId }
    });
    dependents.value = resp.data?.dependents || [];
  } catch {
    error.value = 'Could not load dependent information.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.gdt {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
}
.gdt-hint, .gdt-empty {
  font-size: 14px;
  color: var(--text-secondary, #64748b);
}
.gdt-error {
  font-size: 14px;
  color: var(--danger, #dc2626);
}
.gdt-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.gdt-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg, #fff);
}
.gdt-card-head {
  padding: 14px 16px 10px;
  background: var(--bg-alt, #f8fafc);
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.gdt-name {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.gdt-meta {
  display: flex;
  gap: 10px;
  font-size: 13px;
  color: #64748b;
  flex-wrap: wrap;
  margin-bottom: 2px;
}
.gdt-rel {
  font-style: italic;
}
.gdt-waiver-date {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}
.gdt-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #f1f5f9);
}
.gdt-section:last-child {
  border-bottom: none;
}
.gdt-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--text-secondary, #475569);
}
.gdt-contact-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gdt-contact-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
  align-items: center;
}
.gdt-contact-name {
  font-weight: 600;
}
.gdt-contact-rel {
  color: #64748b;
  font-style: italic;
  font-size: 13px;
}
.gdt-contact-phone {
  color: #0f766e;
  font-size: 13px;
}
.gdt-allergy-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gdt-allergy-row {
  display: flex;
  gap: 8px;
  font-size: 14px;
  flex-wrap: wrap;
}
.gdt-allergy-row--warn {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 4px 10px;
  color: #dc2626;
  font-weight: 600;
}
.gdt-allergy-label {
  font-weight: 600;
  min-width: 100px;
  flex-shrink: 0;
}
.gdt-none {
  font-size: 13px;
  color: var(--text-secondary, #94a3b8);
}
.gdt-footer-notice {
  font-size: 13px;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
}
.muted { color: var(--text-secondary, #64748b); }
</style>
