<template>
  <div class="cgi-page">
    <div v-if="loading" class="cgi-card">Loading…</div>
    <div v-else-if="loadError" class="cgi-card cgi-error">{{ loadError }}</div>
    <div v-else-if="accepted" class="cgi-card">
      <h1>You're connected</h1>
      <p>You are linked as a guardian for {{ dependentNames }}. You will not see the other parent’s answers.</p>
      <section v-if="portalAccess" class="cgi-portal">
        <h2>Your login</h2>
        <p>Username is your email. You can keep it or change it later in the portal.</p>
        <p><strong>Email:</strong> {{ portalAccess.email }}</p>
        <p v-if="portalAccess.password"><strong>Password:</strong> <code>{{ portalAccess.password }}</code></p>
        <p v-else>Use the password you already have for this email.</p>
        <a class="df-btn df-btn-primary" :href="portalAccess.portalPath">Sign in</a>
        <button type="button" class="df-btn df-btn-secondary" :disabled="loginEmailing" @click="emailLoginDetails">
          {{ loginEmailing ? 'Sending…' : 'Email these login details' }}
        </button>
        <p v-if="loginEmailStatus">{{ loginEmailStatus }}</p>
      </section>
      <p>Complete the same kind of intake the other parent completed — your answers stay separate.</p>
      <p v-if="quickHref">
        <a class="cgi-link" :href="quickHref">Fill out the quick interest form</a>
      </p>
      <p v-if="publicKey">
        <a class="cgi-link" :href="fullIntakeHref">Continue to the full intake packet</a>
      </p>
    </div>
    <div v-else class="cgi-card">
      <p class="cgi-kicker">{{ invite.agency?.name }}</p>
      <h1>Complete your guardian information</h1>
      <p>
        Another parent or guardian invited you because you have legal rights for
        {{ dependentNames }}. You will only see this limited information — not what they already submitted.
      </p>
      <ul class="cgi-deps">
        <li v-for="dep in invite.dependents || []" :key="dep.id">{{ dep.firstName }}</li>
      </ul>
      <div class="cgi-fields">
        <label>First name<input v-model="contact.firstName" /></label>
        <label>Last name<input v-model="contact.lastName" /></label>
        <label>Email / username<input v-model="contact.email" type="email" /></label>
        <label>Phone<input v-model="contact.phone" type="tel" /></label>
        <label>Relationship<input v-model="contact.relationship" placeholder="Parent, legal guardian…" /></label>
      </div>
      <p v-if="saveError" class="cgi-error">{{ saveError }}</p>
      <button type="button" class="df-btn df-btn-primary" :disabled="saving" @click="accept">
        {{ saving ? 'Saving…' : 'Connect me and continue' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const loading = ref(true);
const loadError = ref('');
const saveError = ref('');
const saving = ref(false);
const accepted = ref(false);
const invite = ref({ agency: {}, dependents: [], contact: {} });
const portalAccess = ref(null);
const publicKey = ref('');
const loginEmailing = ref(false);
const loginEmailStatus = ref('');
const contact = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  relationship: ''
});

const token = computed(() => String(route.params.token || '').trim());
const dependentNames = computed(() =>
  (invite.value.dependents || []).map((d) => d.firstName).filter(Boolean).join(', ') || 'the connected dependent(s)'
);
const fullIntakeHref = computed(() => {
  const key = publicKey.value;
  if (!key) return '';
  return `/intake/${encodeURIComponent(key)}?coGuardian=${encodeURIComponent(token.value)}`;
});
const quickHref = computed(() => {
  const slug = String(invite.value?.agency?.slug || route.params.agencySlug || route.params.organizationSlug || '').trim();
  if (!slug) return '';
  const svc = String(route.params.serviceType || 'counseling').trim() || 'counseling';
  return `/join/${encodeURIComponent(slug)}/${encodeURIComponent(svc)}?coGuardian=${encodeURIComponent(token.value)}`;
});

onMounted(async () => {
  loading.value = true;
  try {
    const { data } = await api.get(`/public/adaptive-intake/co-guardian/${encodeURIComponent(token.value)}`);
    invite.value = data?.invite || {};
    publicKey.value = invite.value.publicKey || '';
    Object.assign(contact, invite.value.contact || {});
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'This invite is not available.';
  } finally {
    loading.value = false;
  }
});

async function accept() {
  saving.value = true;
  saveError.value = '';
  try {
    const { data } = await api.post(`/public/adaptive-intake/co-guardian/${encodeURIComponent(token.value)}/accept`, {
      contact: { ...contact }
    });
    accepted.value = true;
    portalAccess.value = data?.portalAccess || null;
    publicKey.value = data?.publicKey || publicKey.value;
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || 'Unable to connect this invite.';
  } finally {
    saving.value = false;
  }
}

async function emailLoginDetails() {
  loginEmailStatus.value = '';
  loginEmailing.value = true;
  try {
    const slug = String(invite.value?.agency?.slug || route.params.agencySlug || '').trim();
    await api.post(`/public/adaptive-intake/${encodeURIComponent(slug)}/portal-login-email`, {
      email: portalAccess.value?.email || contact.email,
      username: portalAccess.value?.email || contact.email,
      temporaryPassword: portalAccess.value?.password || null,
      portalPath: portalAccess.value?.portalPath
    });
    loginEmailStatus.value = 'Login details sent.';
  } catch (e) {
    loginEmailStatus.value = e?.response?.data?.error?.message || 'Unable to send login details.';
  } finally {
    loginEmailing.value = false;
  }
}
</script>

<style scoped>
.cgi-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: #f4f7f5;
}
.cgi-card {
  width: min(36rem, 100%);
  background: #fff;
  border-radius: 18px;
  padding: 1.4rem 1.5rem;
  display: grid;
  gap: 0.75rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}
.cgi-kicker { margin: 0; font-weight: 700; color: #1b3d2f; }
.cgi-card h1 { margin: 0; font-size: 1.45rem; color: #143528; }
.cgi-deps { margin: 0; padding-left: 1.1rem; }
.cgi-fields { display: grid; gap: 0.55rem; }
.cgi-fields label { display: grid; gap: 0.2rem; font-size: 0.85rem; font-weight: 600; }
.cgi-fields input {
  min-height: 2.4rem;
  border: 1px solid #d7e3dc;
  border-radius: 10px;
  padding: 0.4rem 0.65rem;
}
.cgi-error { color: #b42318; }
.cgi-portal { border-top: 1px solid #e5e7eb; padding-top: 0.85rem; }
.cgi-link { font-weight: 700; color: #1b3d2f; }
</style>
