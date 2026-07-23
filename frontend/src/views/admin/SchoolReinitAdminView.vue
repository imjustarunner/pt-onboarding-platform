<template>
  <div class="reinit-admin-view">
    <div class="reinit-admin-view__bar">
      <button type="button" class="btn btn-secondary btn-sm" @click="goBack">← Back</button>
      <button type="button" class="btn btn-primary btn-sm" @click="copyToken">
        {{ copied ? 'Copied!' : 'Copy Token' }}
      </button>
    </div>
    <SchoolReinitDashboard
      v-if="schoolOrganizationId && agencyId"
      ref="dashRef"
      mode="admin"
      :school-organization-id="schoolOrganizationId"
      :agency-id="agencyId"
      @dismiss-request="goBack"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SchoolReinitDashboard from '../../components/school/reinit/SchoolReinitDashboard.vue';

const route = useRoute();
const router = useRouter();
const dashRef = ref(null);
const copied = ref(false);

const schoolOrganizationId = computed(() => Number(route.params.schoolOrganizationId || 0));
const agencyId = computed(() => Number(route.query.agencyId || 0));

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push('/admin/schools/overview');
}

async function copyToken() {
  await dashRef.value?.copyShareToken?.();
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<style scoped>
.reinit-admin-view {
  min-height: 100vh;
  background: #f8fafc;
}
.reinit-admin-view__bar {
  display: flex;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}
.btn {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 6px 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: system-ui, sans-serif;
}
.btn-sm {
  font-size: 0.8rem;
}
.btn-primary {
  background: #0c4a6e;
  color: #fff;
}
.btn-secondary {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #334155;
}
</style>
