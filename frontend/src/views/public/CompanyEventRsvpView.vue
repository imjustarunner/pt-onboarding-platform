<template>
  <main class="rsvp-page">
    <section class="rsvp-card" :style="brandStyles">
      <div class="brand-head" v-if="branding.logoUrl || branding.agencyName">
        <img v-if="branding.logoUrl" :src="displayAsset(branding.logoUrl)" alt="Agency logo" class="brand-logo" />
        <div class="brand-name">{{ branding.agencyName }}</div>
      </div>
      <h1>Event RSVP</h1>
      <p v-if="loading">Loading invitation…</p>
      <p v-else-if="error && !event" class="error">{{ error }}</p>
      <div v-else-if="event"><p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="notice" class="save-notice" role="status">{{ notice }}</p>
        <p class="muted">Hi {{ inviteeName }}, you are invited to:</p>
        <h2>{{ event.title }}</h2>
        <p class="details">
          <strong>When:</strong> {{ event.startsAt ? `${formatDateTime(event.startsAt)} – ${formatDateTime(event.endsAt)}` : 'Date and time to be decided' }}<br />
          <strong>Where:</strong> {{ event.locationName || '-' }}<br />
          <strong>Address:</strong> {{ event.locationAddress || '-' }}<br />
          <strong>Venue phone:</strong> {{ event.locationPhone || '-' }}<br />
          <strong>RSVP by:</strong> {{ formatDateTime(event.rsvpDeadline) || 'Any time before event' }}
        </p>
        <div class="image-gallery" v-if="eventImages.length">
          <img
            v-for="(img, idx) in eventImages"
            :key="`rsvp-img-${idx}`"
            :src="displayAsset(img)"
            class="event-image"
            alt="Event image"
          />
        </div>
        <p v-if="event.description">{{ event.description }}</p>
        <p v-if="event.splashContent">{{ event.splashContent }}</p>
        <p v-if="event.familyProvisionNote"><strong>Family details:</strong> {{ event.familyProvisionNote }}</p>
        <p v-if="event.organizerProviding?.length"><strong>Provided by host:</strong> {{ event.organizerProviding.join(', ') }}</p>

        <div v-if="requestedResponse && !linkResponseConfirmed" class="response-note" role="status"><p>You selected <strong>{{ requestedResponse.toUpperCase() }}</strong> in your invitation. Confirm below to save your RSVP.</p><button type="button" class="btn btn-primary" :disabled="submitting" @click="confirmEmailResponse">Confirm {{ requestedResponse.toUpperCase() }}</button></div>
        <div class="response-row">
          <button class="btn btn-primary" type="button" @click="respond('yes')" :disabled="submitting">Yes</button>
          <button class="btn btn-secondary" type="button" @click="respond('maybe')" :disabled="submitting">Maybe</button>
          <button class="btn btn-secondary" type="button" @click="respond('no')" :disabled="submitting">No</button>
        </div>

        <div v-if="currentResponse" class="response-note">
          <strong>{{ confirmationTitle }}</strong>
          <div>{{ confirmationBody }}</div>
          <div style="margin-top:6px;">Current response: <strong>{{ currentResponse.toUpperCase() }}</strong></div>
        </div>

        <div v-if="showRegistration" class="registration-box">
          <h3>Registration details</h3>
          <div class="grid">
            <div>
              <label>Guest count</label>
              <input v-model.number="registration.guestCount" class="input" type="number" min="0" />
            </div>
            <div>
              <label>Dietary notes</label>
              <input v-model.trim="registration.dietaryNotes" class="input" />
            </div>
          </div>
          <label>Anything else?</label>
          <textarea v-model.trim="registration.notes" class="input" rows="3" />
          <div class="potluck-registration-actions">
            <section v-if="event.potluckEnabled && currentResponse === 'yes'" class="potluck-signup"><h3>What are you bringing?</h3><label>Choose a requested item<select v-model="registration.needListItemId"><option value="">No contribution selected</option><option v-for="item in availableContributions" :key="item.id" :value="item.id">{{ item.isOpenRequest && !item.mine ? `Your choice of ${item.itemCategory}` : item.itemName }}{{ item.mine ? ' · Your contribution' : '' }}</option></select></label><label v-if="selectedContribution?.isOpenRequest">Tell us what you are bringing<input v-model.trim="registration.needListCustomItemName" maxlength="255" required /></label><p v-if="selectedContribution?.itemNotes">{{ selectedContribution.itemNotes }}</p><p v-if="!availableContributions.length">All requested items are claimed. You can still attend.</p></section>
          <button class="btn btn-primary" type="button" @click="submitRegistration" :disabled="submitting">
              {{ submitting ? 'Saving…' : 'Submit registration' }}
            </button>
            <a
              v-if="event.registrationFormUrl"
              class="btn btn-secondary"
              :href="event.registrationFormUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open external form
            </a>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const route = useRoute();
const token = computed(() => String(route.params.token || '').trim());
const loading = ref(false);
const submitting = ref(false);
const error = ref(''), notice = ref('');
const event = ref(null);
const invitation = ref(null);
const invitee = ref(null);
const currentResponse = ref('');
const linkResponseConfirmed = ref(false);
const requestedResponse = computed(() => ['yes','no','maybe'].includes(String(route.query?.r || '').toLowerCase()) ? String(route.query.r).toLowerCase() : '');
async function confirmEmailResponse() { await respond(requestedResponse.value); if(!error.value) linkResponseConfirmed.value=true; }
const branding = ref({
  agencyName: '',
  logoUrl: '',
  colorPalette: null,
  themeSettings: null
});

const registration = ref({
  guestCount: 0,
  dietaryNotes: '',
  notes: '', needListItemId: '', needListCustomItemName: ''
});

const inviteeName = computed(() => {
  const first = String(invitee.value?.firstName || '').trim();
  const last = String(invitee.value?.lastName || '').trim();
  return `${first} ${last}`.trim() || 'there';
});

const selectedContribution = computed(() => event.value?.needList?.find(item => item.id === Number(registration.value.needListItemId)));
const availableContributions = computed(() => (event.value?.needList || []).filter(item => !item.claimed || item.mine));
const showRegistration = computed(() => currentResponse.value === 'yes' || currentResponse.value === 'maybe');
const eventImages = computed(() => {
  const out = [];
  if (event.value?.eventImageUrl) out.push(String(event.value.eventImageUrl));
  if (Array.isArray(event.value?.eventImageUrls)) {
    for (const u of event.value.eventImageUrls) {
      const s = String(u || '').trim();
      if (s) out.push(s);
    }
  }
  if (event.value?.publicHeroImageUrl) out.push(String(event.value.publicHeroImageUrl));
  return [...new Set(out)];
});

const brandStyles = computed(() => {
  const cp = branding.value?.colorPalette || {};
  const ts = branding.value?.themeSettings || {};
  const styles = {};
  if (cp.primary) styles['--rsvp-primary'] = cp.primary;
  if (cp.secondary) styles['--rsvp-secondary'] = cp.secondary;
  if (ts.fontFamily) styles['font-family'] = ts.fontFamily;
  return styles;
});

const confirmationTitle = computed(() => {
  if (currentResponse.value === 'yes') return 'Great — you are marked as attending.';
  if (currentResponse.value === 'maybe') return 'Thanks — you are marked as maybe attending.';
  if (currentResponse.value === 'no') return "Thanks for letting us know you can't make it.";
  return '';
});

const confirmationBody = computed(() => {
  if (currentResponse.value === 'yes' || currentResponse.value === 'maybe') {
    return 'Please complete the registration details below so we can plan food and seating.';
  }
  if (currentResponse.value === 'no') {
    return 'Your RSVP has been recorded for this invite.';
  }
  return '';
});

const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString();
};

const displayAsset = (value) => {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('/uploads/') || s.startsWith('uploads/')) return toUploadsUrl(s);
  return s;
};

const storeRsvpLocally = (response) => {
  try {
    const eid = event.value?.id;
    if (!eid) return;
    localStorage.setItem(`rsvp_event_${eid}`, JSON.stringify({
      response,
      name: inviteeName.value !== 'there' ? inviteeName.value : '',
      at: new Date().toISOString()
    }));
  } catch { /* ignore */ }
};

const load = async () => {
  if (!token.value) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/company-events/rsvp/${encodeURIComponent(token.value)}`, {
      skipAuthRedirect: true
    });
    event.value = resp.data?.event || null;
    invitation.value = resp.data?.invitation || null;
    invitee.value = resp.data?.invitee || null;
    branding.value = resp.data?.branding || branding.value;
    currentResponse.value = String(resp.data?.invitation?.response || '').toLowerCase();
    // Persist any existing response so the public event page can show confirmation on return visits.
    if (currentResponse.value) storeRsvpLocally(currentResponse.value);
    const registrationPayload = resp.data?.invitation?.registrationPayload || null;
    if (registrationPayload && typeof registrationPayload === 'object') {
      registration.value = {
        guestCount: Number(registrationPayload.guestCount || 0) || 0,
        dietaryNotes: String(registrationPayload.dietaryNotes || ''),
        notes: String(registrationPayload.notes || ''), needListItemId: registrationPayload.needListItemId || '', needListCustomItemName: registrationPayload.needListCustomItemName || ''
      };
    }
    const mine = event.value?.needList?.find(item => item.mine);
    if (event.value?.potluckEnabled) { registration.value.needListItemId = mine?.id || ''; registration.value.needListCustomItemName = mine?.isOpenRequest ? mine.itemName : ''; }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Invitation could not be loaded';
  } finally {
    loading.value = false;
  }
};

const respond = async (response) => {
  submitting.value = true;
  error.value = '';
  try {
    await api.post(
      `/company-events/rsvp/${encodeURIComponent(token.value)}`,
      { response },
      { skipAuthRedirect: true }
    );
    currentResponse.value = response;
    storeRsvpLocally(response);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to save RSVP';
  } finally {
    submitting.value = false;
  }
};

const submitRegistration = async () => {
  submitting.value = true;
  error.value = ''; notice.value = '';
  try {
    await api.post(
      `/company-events/rsvp/${encodeURIComponent(token.value)}`,
      {
        response: currentResponse.value || 'yes',
        registration: {
          guestCount: Number(registration.value.guestCount || 0) || 0,
          dietaryNotes: registration.value.dietaryNotes || '',
          notes: registration.value.notes || '',
          needListItemId: Number(registration.value.needListItemId) || null, needListCustomItemName: registration.value.needListCustomItemName || ''
        }
      },
      { skipAuthRedirect: true }
    );
    await load();
    if (!error.value) notice.value = event.value?.potluckEnabled ? 'Registration and potluck contribution saved.' : 'Registration saved.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to submit registration';
  } finally {
    submitting.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.rsvp-page { min-height: 100vh; display: flex; justify-content: center; align-items: flex-start; padding: 24px; background: #f7fafc; }
.rsvp-card { width: min(860px, 100%); background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; }
.rsvp-card h1 { margin: 0 0 8px; }
.rsvp-card h2 { margin: 0 0 8px; }
.muted { color: #64748b; }
.details { line-height: 1.5; }
.response-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.response-note { margin-top: 10px; border: 1px solid #d9e6ff; background: #f0f6ff; border-radius: 8px; padding: 10px; }
.registration-box { margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(140px, 1fr)); gap: 10px; margin-bottom: 8px; }
.error { color: #b91c1c; }
.brand-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.brand-logo { width: 44px; height: 44px; object-fit: contain; border-radius: 6px; border: 1px solid #e5e7eb; background: #fff; }
.brand-name { font-weight: 700; color: var(--rsvp-primary, #0f766e); }
.image-gallery { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); margin: 10px 0; }
.event-image { width: 100%; height: 128px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; }
.btn.btn-primary { background: var(--rsvp-primary, #0f766e); border-color: var(--rsvp-primary, #0f766e); }
</style>

<style scoped>.potluck-signup{padding:14px;background:#f2f6fd;border-radius:10px;margin:16px 0}.potluck-signup label{display:grid;gap:6px;margin:10px 0}.potluck-signup input,.potluck-signup select{padding:9px;border:1px solid #b8c8df;border-radius:7px;width:100%;box-sizing:border-box}</style>

<style scoped>.save-notice{padding:12px;background:#e5f4ed;border-radius:8px;color:#176447}.potluck-registration-actions{display:grid;gap:10px}</style>
