<template>
  <div class="pyu-public">
    <div v-if="requiresLogin" class="pyu-login-gate">
      <h1>Provider Year Update</h1>
      <p v-if="loginInfo.providerName">Hi {{ loginInfo.providerName }} — sign in to continue your Year Update.</p>
      <p v-else>Sign in with your provider account to continue.</p>
      <router-link class="btn btn-primary" :to="loginTo">Sign in</router-link>
    </div>
    <div v-else-if="wrongUser" class="pyu-login-gate">
      <h1>Wrong account</h1>
      <p>{{ wrongUser }}</p>
      <router-link class="btn btn-secondary" to="/dashboard">Go to My Dashboard</router-link>
    </div>
    <ProviderYearUpdateDashboard
      v-else
      mode="token"
      :token="token"
      @requires-login="onRequiresLogin"
      @loaded="onLoaded"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import ProviderYearUpdateDashboard from '../../components/provider/ProviderYearUpdateDashboard.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const token = computed(() => String(route.params.token || ''));
const requiresLogin = ref(false);
const loginInfo = ref({});
const wrongUser = ref('');

const loginTo = computed(() => ({
  path: '/login',
  query: { redirect: `/provider-year-update/${token.value}` },
}));

function onRequiresLogin(info) {
  if (authStore.isAuthenticated) {
    // Already logged in but API asked for login — treat as soft redirect to hub
    router.replace('/provider/year-update').catch(() => {});
    return;
  }
  requiresLogin.value = true;
  loginInfo.value = info || {};
}

function onLoaded() {
  requiresLogin.value = false;
}
</script>

<style scoped>
.pyu-public {
  min-height: 100vh;
  background: #f8fafc;
}
.pyu-login-gate {
  max-width: 420px;
  margin: 10vh auto;
  padding: 28px 24px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  text-align: center;
}
.pyu-login-gate h1 {
  margin: 0 0 10px;
  color: #0c4a6e;
  font-size: 1.4rem;
}
.pyu-login-gate p {
  color: #475569;
  margin: 0 0 18px;
  line-height: 1.45;
}
</style>
