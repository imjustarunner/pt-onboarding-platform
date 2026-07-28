<template>
  <div class="so-demo">
    <div class="so-demo-banner">
      <div>
        <strong>Hogwarts demo — view only</strong>
        <span class="muted">Browse the school portal. Changes are disabled.</span>
      </div>
      <div class="so-demo-actions">
        <button type="button" class="btn ghost" @click="backToOnboarding">← Back to onboarding</button>
        <button type="button" class="btn primary" :disabled="!ready" @click="continueReview">
          Continue to review →
        </button>
      </div>
    </div>

    <div v-if="loading" class="so-demo-msg muted">Loading Hogwarts demo…</div>
    <div v-else-if="error" class="so-demo-msg error">{{ error }}</div>
    <SchoolPortalView v-else-if="ready" :preview-mode="true" />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useOrganizationStore } from '../../store/organization';
import SchoolPortalView from '../school/SchoolPortalView.vue';

const route = useRoute();
const router = useRouter();
const organizationStore = useOrganizationStore();

const loading = ref(true);
const ready = ref(false);
const error = ref('');
const token = String(route.params.token || '').trim();

function backToOnboarding() {
  router.push(`/school-onboarding/${token}/explore_demo`);
}

function continueReview() {
  router.push(`/school-onboarding/${token}/review_submit`);
}

onMounted(async () => {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/public/school-onboarding/${token}/demo`);
    const demo = res.data?.demo;
    if (!demo?.id) {
      throw new Error('Demo school not found');
    }
    organizationStore.setCurrentOrganization({
      id: demo.id,
      name: demo.name || 'Hogwarts',
      slug: demo.slug || 'hogwarts',
      portal_url: demo.slug || 'hogwarts',
      organization_type: 'school',
      is_active: true,
      logo_url: null,
      color_palette: null,
      theme_settings: null
    });
    ready.value = true;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Unable to open demo';
    ready.value = false;
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  // Leave Hogwarts context; shell will reload draft school as needed.
});
</script>

<style scoped>
.so-demo {
  min-height: 100vh;
  background: #f8fafc;
}
.so-demo-banner {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  background: #0f172a;
  color: #fff;
}
.so-demo-banner .muted {
  display: block;
  color: #cbd5e1;
  font-size: 0.85rem;
  margin-top: 0.15rem;
}
.so-demo-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 0.45rem 0.85rem;
  font: inherit;
  cursor: pointer;
}
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn.primary { background: #3b82f6; color: #fff; }
.btn.ghost { background: rgba(255, 255, 255, 0.12); color: #fff; }
.so-demo-msg {
  padding: 2rem 1.25rem;
}
.error { color: #b91c1c; }
.muted { color: #64748b; }
</style>
