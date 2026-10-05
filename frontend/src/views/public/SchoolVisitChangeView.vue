<template>
  <main class="visit-page">
    <section class="visit-card">
      <img class="brand" src="/email-branding/itsco/email-header.png" alt="ITSCO" />
      <div class="content">
        <p class="eyebrow">SCHOOL CHECK-IN</p><h1>Request a change</h1>
        <p v-if="loading" role="status">Loading your visit…</p>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <template v-if="visit">
          <h2>{{ visit.schoolName }}</h2>
          <div class="details"><strong>{{ when }}</strong><br>{{ visit.modality === 'virtual' ? 'Virtual check-in with Rachel' : 'In-person check-in with Rachel' }}<br><span v-if="visit.modality !== 'virtual'">{{ visit.location }}</span></div>
          <p v-if="visit.calendarSyncStatus !== 'ready'" class="notice">The Schools team is updating these details. Please follow Rachel’s latest message.</p>
          <p v-if="visit.status === 'cancelled'" role="status">This visit has been cancelled. Contact the Schools team to arrange another time.</p>
          <p v-else-if="submitted" role="status" class="notice">{{ submitted }}</p>
          <form v-else @submit.prevent="submit">
            <p>Let us know what would work better. Your appointment stays as currently arranged until Rachel confirms a change.</p>
            <label>Your name<input v-model.trim="form.name" required maxlength="150" autocomplete="name" /></label>
            <label>Contact email<input v-model.trim="form.email" type="email" required maxlength="254" autocomplete="email" /></label>
            <label>What would you like to change?<select v-model="form.kind"><option value="reschedule">Request another date or time</option><option value="virtual">Request a virtual visit</option><option value="cancel">Request cancellation</option><option value="other">Something else</option></select></label>
            <label>Preferred arrangements<textarea v-model.trim="form.note" required maxlength="2000" rows="4" placeholder="Share a few times that work, or tell us what needs to change. Please do not include student information." /></label>
            <button :disabled="saving">{{ saving ? 'Sending request…' : 'Send change request' }}</button>
          </form>
        </template>
        <p class="footer">Questions? <a href="mailto:schools@itsco.health">schools@itsco.health</a></p>
      </div>
    </section>
  </main>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
const route = useRoute(), visit = ref(null), loading = ref(true), saving = ref(false), error = ref(''), submitted = ref('');
const form = reactive({ name: '', email: '', kind: 'reschedule', note: '' });
const endpoint = computed(() => `/public/school-visits/${encodeURIComponent(String(route.params.token || ''))}`);
const when = computed(() => visit.value?.startsAt ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', dateStyle: 'full', timeStyle: 'short' }).format(new Date(visit.value.startsAt)) + ' (Mountain time)' : '');
onMounted(async () => {
  try { visit.value = (await api.get(endpoint.value, { skipAuthRedirect: true })).data.visit; }
  catch (e) { error.value = e.response?.data?.error?.message || 'Unable to load this visit. Please contact the Schools team.'; }
  finally { loading.value = false; }
});
async function submit() {
  saving.value = true; error.value = '';
  try { const { data } = await api.post(`${endpoint.value}/change-requests`, { ...form, revision: visit.value.revision }, { skipAuthRedirect: true }); submitted.value = data.message; }
  catch (e) { error.value = e.response?.data?.error?.message || 'Unable to submit. Please try again or contact the Schools team.'; }
  finally { saving.value = false; }
}
</script>
<style scoped>
.visit-page{min-height:100vh;background:#f0f5f1;padding:32px 16px;color:#263c33}.visit-card{max-width:640px;margin:auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px #163e2912}.brand{display:block;width:100%;height:auto}.content{padding:28px}.eyebrow{letter-spacing:2px;font-size:12px;font-weight:700;color:#367552}h1{font-size:30px;color:#145a3d}h2{font-size:20px}.details,.notice{background:#edf5ef;padding:16px;border-radius:10px;line-height:1.7}label{display:grid;gap:8px;margin:18px 0;font-weight:600}input,select,textarea{font:inherit;box-sizing:border-box;width:100%;padding:12px;border:1px solid #b6cbbd;border-radius:8px}button{background:#145a3d;color:white;border:0;padding:14px 22px;border-radius:8px;font:inherit;font-weight:700;cursor:pointer}button:disabled{opacity:.6}.error{color:#a32626}.footer{margin-top:26px;font-size:14px}a{color:#145a3d}
</style>
