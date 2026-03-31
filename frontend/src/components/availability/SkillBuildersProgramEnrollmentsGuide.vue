<template>
  <section class="sbpeg card">
    <div class="sbpeg-head">
      <div>
        <h2 class="sbpeg-title">Program enrollments</h2>
        <p class="sbpeg-sub muted">
          Individual client onboarding uses <strong>learning program classes</strong> (enrollment offerings) on the program
          organization, plus an active intake link (smart registration or intake with a registration step) scoped to that class.
          Public listings appear on <strong>/enroll</strong> when <code>registration_eligible</code> is on and enrollment
          windows are open.
        </p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>
    <div v-if="error" class="sbpeg-err">{{ error }}</div>
    <p v-else-if="!agencyId" class="muted">Select an agency to load affiliated programs.</p>
    <ul v-else-if="programs.length" class="sbpeg-list">
      <li v-for="p in programs" :key="`sbpeg-${p.id}`" class="sbpeg-row">
        <div class="sbpeg-meta">
          <div class="sbpeg-name">{{ p.name }}</div>
          <div class="muted small">Portal slug: <code>{{ p.slug }}</code></div>
        </div>
        <div class="sbpeg-links">
          <div class="sbpeg-path">
            <span class="sbpeg-label">Branded (agency slug)</span>
            <code>{{ brandedProgramEnrollPath(p.slug) }}</code>
          </div>
          <div class="sbpeg-path">
            <span class="sbpeg-label">Open-events path</span>
            <code>{{ openProgramEnrollPath(p.slug) }}</code>
          </div>
          <router-link
            v-if="agencyPortalSlug"
            class="btn btn-sm btn-secondary"
            :to="`/${agencyPortalSlug}/admin/digital-forms`"
          >
            Digital forms (agency admin)
          </router-link>
        </div>
      </li>
    </ul>
    <p v-else class="muted">No affiliated program organizations for this agency.</p>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, default: 0 },
  /** Parent agency portal slug — used for branded /{slug}/… paths. */
  agencyPortalSlug: { type: String, default: '' }
});

const loading = ref(false);
const error = ref('');
const programs = ref([]);

function openProgramEnrollPath(programSlug) {
  const a = String(props.agencyPortalSlug || '').trim();
  const ps = String(programSlug || '').trim();
  if (!a || !ps) return '—';
  return `/open-events/${a}/programs/${ps}/enroll`;
}

function brandedProgramEnrollPath(programSlug) {
  const a = String(props.agencyPortalSlug || '').trim();
  const ps = String(programSlug || '').trim();
  if (!a || !ps) return '—';
  return `/${a}/programs/${ps}/enroll`;
}

async function load() {
  if (!props.agencyId) {
    programs.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/skill-builders/directory/agency/${props.agencyId}/affiliated-program-orgs`, {
      skipGlobalLoading: true
    });
    programs.value = Array.isArray(r.data?.programs) ? r.data.programs : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    programs.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.agencyId,
  () => load(),
  { immediate: true }
);
</script>

<style scoped>
.sbpeg {
  padding: 1.25rem 1.5rem;
  margin-top: 1.5rem;
}
.sbpeg-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.sbpeg-title {
  margin: 0;
  font-size: 1.2rem;
  color: var(--primary, #15803d);
}
.sbpeg-sub {
  margin: 8px 0 0;
  max-width: 820px;
  font-size: 0.9rem;
  line-height: 1.5;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.sbpeg-err {
  color: #b91c1c;
  font-size: 0.9rem;
}
.sbpeg-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sbpeg-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}
.sbpeg-row:last-child {
  border-bottom: none;
}
.sbpeg-name {
  font-weight: 700;
}
.sbpeg-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 240px;
}
.sbpeg-path code {
  display: block;
  font-size: 0.78rem;
  word-break: break-all;
  margin-top: 4px;
  padding: 6px 8px;
  background: #f1f5f9;
  border-radius: 6px;
}
.sbpeg-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
</style>
