<template>
  <div class="eoo">
    <div v-if="loading" class="pad">Loading…</div>
    <div v-else-if="done" class="pad">
      <h1>{{ isSchoolStaff ? 'Group emails stopped' : 'You’re opted out' }}</h1>
      <p v-if="isSchoolStaff">
        We set the group email subscription for <strong>{{ email }}</strong>
        to <strong>No email</strong>
        <template v-if="groupEmail"> on <strong>{{ groupEmail }}</strong></template>.
        You still have school portal access and remain a member of the group — we only stopped email delivery.
      </p>
      <p v-else>
        We won’t email <strong>{{ email }}</strong> from this system anymore.
      </p>
    </div>
    <div v-else-if="error" class="err pad">{{ error }}</div>
    <div v-else class="pad">
      <h1>{{ isSchoolStaff ? 'Stop school group emails' : 'Opt out of emails' }}</h1>
      <p v-if="isSchoolStaff">
        Confirm you want to change your subscription to the school group
        <template v-if="groupEmail"> <strong>{{ groupEmail }}</strong></template>
        from Each email to <strong>No email</strong>.
        This does not remove you from the portal or the group.
      </p>
      <p v-else>
        Confirm you want to stop receiving emails
        <template v-if="email"> at <strong>{{ email }}</strong></template>
        <template v-if="agencyName"> from {{ agencyName }}</template>.
      </p>
      <button type="button" class="btn" :disabled="busy" @click="confirm">
        {{ busy ? 'Saving…' : (isSchoolStaff ? 'Change to No email' : 'Confirm opt out') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const email = ref('');
const agencyName = ref('');
const done = ref(false);
const isSchoolStaff = ref(false);
const groupEmail = ref('');

onMounted(async () => {
  try {
    const token = String(route.params.token || '');
    const { data } = await axios.get(`/api/public/email-opt-out/${encodeURIComponent(token)}`);
    email.value = data.email || '';
    agencyName.value = data.agencyName || '';
    isSchoolStaff.value = !!data.isSchoolStaff;
    groupEmail.value = data.groupEmail || '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'This opt-out link is invalid or expired.';
  } finally {
    loading.value = false;
  }
});

async function confirm() {
  busy.value = true;
  error.value = '';
  try {
    const token = String(route.params.token || '');
    const { data } = await axios.post(`/api/public/email-opt-out/${encodeURIComponent(token)}`);
    done.value = true;
    isSchoolStaff.value = !!data.keptGroupMembership || data.role === 'school_staff' || isSchoolStaff.value;
    if (data.email) email.value = data.email;
    if (data.groupEmail) groupEmail.value = data.groupEmail;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not complete opt out.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.eoo {
  min-height: 70vh;
  display: grid;
  place-items: center;
  font-family: system-ui, -apple-system, sans-serif;
  background: #f8fafc;
  color: #0f172a;
}
.pad {
  max-width: 440px;
  padding: 28px;
  text-align: center;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
h1 { margin: 0 0 12px; font-size: 1.4rem; }
p { margin: 0 0 18px; line-height: 1.5; color: #334155; }
.btn {
  border: none;
  border-radius: 10px;
  padding: 12px 16px;
  font-weight: 700;
  background: #0f766e;
  color: #fff;
  cursor: pointer;
}
.err { color: #b91c1c; }
</style>
