<template>
  <div class="demo-launch">
    <div class="demo-launch-card">
      <div class="pulse" />
      <h1>Opening demo lab session…</h1>
      <p>{{ status }}</p>
      <p v-if="error" class="err">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { decodeDemoLaunchHash } from '../utils/demoWindowSession';

const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const status = ref('Preparing isolated window session');
const error = ref('');

onMounted(async () => {
  try {
    const payload = decodeDemoLaunchHash(window.location.hash);
    if (!payload?.token || !payload?.user) {
      error.value = 'Missing launch payload. Close this window and try again from the Demo Testing Lab.';
      return;
    }

    status.value = `Binding ${payload.user.role} view for ${payload.selectedAgency?.name || 'tenant'}…`;
    authStore.setWindowScopedAuth({
      token: payload.token,
      user: payload.user,
      agency: payload.selectedAgency || null,
      targetPath: payload.targetPath || null
    });

    if (payload.selectedAgency) {
      agencyStore.setCurrentAgency(payload.selectedAgency);
    }

    // Strip hash so refresh does not re-decode; sessionStorage already has the session.
    history.replaceState(null, '', window.location.pathname + window.location.search);

    const path = String(payload.targetPath || '/dashboard').trim() || '/dashboard';
    status.value = 'Launching interface…';
    await router.replace(path);
  } catch (e) {
    error.value = e?.message || 'Failed to open demo session';
  }
});
</script>

<style scoped>
.demo-launch {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(1200px 600px at 20% 0%, #1e293b, #020617);
  color: #e2e8f0;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}
.demo-launch-card {
  text-align: center;
  padding: 2rem 2.5rem;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.25);
  max-width: 420px;
}
.pulse {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  margin: 0 auto 1rem;
  background: #38bdf8;
  box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.6);
  animation: pulse 1.4s infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.55); }
  70% { box-shadow: 0 0 0 16px rgba(56, 189, 248, 0); }
  100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
}
h1 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}
p {
  margin: 0;
  color: #94a3b8;
  font-size: 0.92rem;
}
.err {
  margin-top: 0.75rem;
  color: #fca5a5;
}
</style>
