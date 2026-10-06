<template>
  <section class="mh-volunteer mh-wrap" aria-labelledby="volunteer-heading">
    <h2 id="volunteer-heading">Volunteer interest application</h2>
    <p>Help us prepare for future opportunities. Applying expresses interest and does not guarantee a placement. These are unpaid volunteer roles; we’ll contact you if a suitable project becomes available.</p>
    <p v-if="preview" role="status">Application preview. Submit your application from the published website.</p>
    <div v-else-if="sent" role="status">
      <h3>Thank you for raising your hand.</h3>
      <p>Your volunteer application has been received. Your reference is #{{ ticketId }}. The MH4Kidz team can follow up using your contact information as plans develop.</p>
    </div>
    <form v-else @submit.prevent="submit">
      <div class="volunteer-fields">
        <label>Full name (required)<input v-model.trim="form.name" autocomplete="name" required minlength="2" maxlength="120" /></label>
        <label>Email address (required)<input v-model.trim="form.email" type="email" autocomplete="email" required maxlength="255" /></label>
        <label>Phone number (optional)<input v-model.trim="form.phone" type="tel" autocomplete="tel" minlength="7" maxlength="40" /></label>
        <label>City and state (required)<input v-model.trim="form.location" required maxlength="120" /></label>
      </div>
      <fieldset aria-describedby="volunteer-interests-help">
        <legend>How would you like to help?</legend>
        <p id="volunteer-interests-help">Choose at least one area. All opportunities are still being planned.</p>
        <label v-for="area in areas" :key="area" class="volunteer-check"><input v-model="form.interests" type="checkbox" :value="area" />{{ area }}</label>
      </fieldset>
      <label>Availability (required)<textarea v-model.trim="form.availability" required maxlength="500" rows="3" placeholder="For example: a few hours a month, weekday evenings, or occasional weekends." /></label>
      <label>Skills, experience, or why you’d like to help (optional)<textarea v-model.trim="form.experience" maxlength="1500" rows="4" /></label>
      <p>Please leave out health information, Social Security numbers, and payment details. <a href="/community-standards" target="_blank" rel="noopener">Community Standards &amp; communication privacy</a> apply.</p>
      <input v-model="form.website" class="volunteer-honeypot" tabindex="-1" aria-hidden="true" autocomplete="off" />
      <label class="volunteer-check"><input v-model="form.consent" type="checkbox" required />I understand these are proposed, unpaid opportunities, and I agree that MH4Kidz may contact me about my application. I have not included sensitive information.</label>
      <p v-if="error" role="alert">{{ error }}</p>
      <button v-if="!ready && !loading" class="mh-button" type="button" @click="load">Try loading the application again</button>
      <button class="mh-button" type="submit" :disabled="busy || !ready">{{ busy ? 'Submitting…' : loading ? 'Loading application…' : 'Submit volunteer application' }}</button>
    </form>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import api from '../../services/api';
import { websiteCaptchaToken } from '../../utils/websiteCaptcha';

const areas = ['Fundraising events', 'Community outreach', 'Researching grants', 'Organizing educational resources', 'Administrative help'];
const preview = new URLSearchParams(window.location.search).get('marketingPreview') === '1' || window.self !== window.top;
const form = reactive({ name: '', email: '', phone: '', location: '', interests: [], availability: '', experience: '', website: '', consent: false });
const ready = ref(false), loading = ref(false), busy = ref(false), error = ref(''), sent = ref(false), ticketId = ref(null);
let config = {};
async function load() {
  if (preview) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/public/agency-support/mh4kidz', { skipAuthRedirect: true, skipGlobalLoading: true });
    config = data;
    ready.value = true;
  } catch {
    error.value = 'The application is temporarily unavailable. Please try again.';
  } finally { loading.value = false; }
}
onMounted(load);
async function submit() {
  if (preview || busy.value || !ready.value) return;
  error.value = '';
  if (!form.interests.length) { error.value = 'Please choose at least one volunteer area.'; return; }
  if (!form.name || !form.email || !form.location || !form.availability || !form.consent) {
    error.value = 'Please complete the required fields and acknowledgment.'; return;
  }
  busy.value = true;
  try {
    const captchaToken = await websiteCaptchaToken(config.recaptchaSiteKey, 'public_agency_support', config.recaptchaRequired);
    const message = ['Volunteer interest application', `Location: ${form.location}`, `Areas of interest: ${form.interests.join(', ')}`, `Availability: ${form.availability}`, `Skills, experience, and motivation: ${form.experience || 'Not provided'}`, 'Acknowledgment: Proposed, unpaid opportunities; no placement guaranteed. Applicant agrees to follow-up about this application.'].join('\n\n');
    const { data } = await api.post('/public/agency-support/mh4kidz/tickets', {
      name: form.name, email: form.email, phone: form.phone, category: 'other', message,
      website: form.website, phiAcknowledged: form.consent, captchaToken
    }, { skipAuthRedirect: true });
    if (!data.ok || !data.ticketId) throw new Error('We could not confirm your application. Please try again.');
    ticketId.value = data.ticketId;
    sent.value = true;
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'Please try again.'; }
  finally { busy.value = false; }
}
</script>

<style scoped>
.mh-volunteer{max-width:850px;padding-top:40px;padding-bottom:40px}.mh-volunteer form{margin-top:28px}.volunteer-fields{display:grid;grid-template-columns:1fr 1fr;gap:20px}.mh-volunteer label{display:grid;gap:8px;margin-bottom:20px}.mh-volunteer input,.mh-volunteer textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b5c8c5;border-radius:8px;background:white;color:#172d36;font:inherit}.mh-volunteer textarea{resize:vertical}.mh-volunteer fieldset{border:1px solid #b5c8c5;border-radius:12px;padding:20px;margin:0 0 24px}.mh-volunteer legend{font-weight:700}.mh-volunteer .volunteer-check{display:flex;align-items:flex-start;gap:12px}.volunteer-check input{width:20px;height:20px;flex:0 0 20px;margin-top:4px}.volunteer-honeypot{position:absolute;left:-10000px;width:1px!important;height:1px!important}.mh-volunteer button:disabled{opacity:.6;cursor:wait}.mh-volunteer button{margin:8px 12px 0 0}@media(max-width:600px){.volunteer-fields{grid-template-columns:1fr}}
</style>
