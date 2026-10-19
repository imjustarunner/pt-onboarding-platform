<template>
  <section v-if="scopedAgencyIds.length && (staffView || providerId) && (!hideUnlessEnabled || waitlistEnabled || requests.length)" ref="panel" class="pew" :class="{'pew--compact':compact}" @keydown.esc="expanded=false" aria-label="Provider enrollment waitlist">
    <div class="pew-heading">
      <button type="button" class="pew-toggle" :aria-expanded="expanded" :aria-controls="listId" @click="expanded = !expanded">
        <span>{{ staffView ? 'Provider waitlists' : 'My waitlist' }}</span>
        <strong v-if="loaded" class="pew-count">{{ requests.length }}</strong>
        <span v-else class="pew-checking">{{ loading ? 'Checking…' : 'Unavailable' }}</span>
        <span v-if="loaded" class="pew-count-caption">{{ requests.length === 1 ? 'person waiting' : 'people waiting' }}</span>
        <span class="pew-chevron" aria-hidden="true">{{ expanded ? '▴' : '▾' }}</span>
      </button>
      <button v-if="loaded || error" type="button" class="pew-refresh" :disabled="loading" aria-label="Refresh provider waitlist" @click="load">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
    </div>
    <p v-if="error" class="pew-error" role="alert">{{ error }}</p>
    <div v-if="expanded" :id="listId" class="pew-body">
      <p class="pew-intro">{{ staffView ? 'People who requested a specific provider’s waitlist. Review their scheduling preferences, coordinate an opening, and update the waitlist when they are placed or withdraw.' : 'People who requested your waitlist. Use their scheduling preferences to help fill openings, and coordinate placement with support or a care coordinator.' }}</p>
      <p v-if="loading && !loaded" role="status">Loading waitlist requests…</p>
      <p v-else-if="!requests.length && !error" class="pew-empty">No one is currently waiting for {{ staffView ? 'these providers' : 'you' }}.</p>
      <article v-for="request in requests" :key="`${request.agencyId}-${request.providerId}-${request.clientId || request.id}`" class="pew-request">
        <div class="pew-request-heading">
          <div><h3>{{ request.clientName || 'Prospective client' }}</h3><p>{{ [staffView ? request.providerName : '', request.agencyName].filter(Boolean).join(' · ') }}</p></div>
          <span class="pew-waiting" :title="joinedDate(request.joinedAt)">{{ waitlistWaitingLabel(request.joinedAt) }}</span>
        </div>
        <dl class="pew-preferences">
          <div><dt>Setting</dt><dd>{{ waitlistSettingLabel(request.modality) }}</dd></div>
          <div v-if="request.joinedAt"><dt>Joined</dt><dd>{{ joinedDate(request.joinedAt) }}</dd></div>
          <div v-if="waitlistPreferenceText(request.preferredDays)"><dt>Preferred days</dt><dd>{{ waitlistPreferenceText(request.preferredDays) }}</dd></div>
          <div v-if="waitlistPreferenceText(request.preferredTimes)"><dt>Preferred times</dt><dd>{{ waitlistPreferenceText(request.preferredTimes) }}<small v-if="request.timeZone">{{ request.timeZone }}</small></dd></div>
          <div v-if="waitlistOpeningLabel(request.requestedOpening)" class="pew-preference-wide"><dt>Requested appointment time</dt><dd>{{ waitlistOpeningLabel(request.requestedOpening) }}<small>Placement and appointment time need care-team confirmation.</small></dd></div>
          <div v-if="request.schedulingNotes" class="pew-preference-wide"><dt>Scheduling preferences</dt><dd>{{ request.schedulingNotes }}</dd></div>
        </dl>
        <p v-if="!hasTiming(request)" class="pew-no-times">No day or time preference recorded. Coordinate timing with the contact below.</p>
        <div v-if="request.contact?.name || request.contact?.email || request.contact?.phone" class="pew-contact">
          <span v-if="request.contact.name">Contact: {{ request.contact.name }}</span>
          <a v-if="request.contact.email" :href="`mailto:${encodeURIComponent(request.contact.email)}`">{{ request.contact.email }}</a>
          <a v-if="request.contact.phone" :href="`tel:${String(request.contact.phone).replace(/[^+\d]/g, '')}`">{{ request.contact.phone }}</a>
        </div>
        <button v-if="staffView && request.canManage" class="pew-review" type="button" @click="emit('review', request)">Review placement &amp; waitlist</button>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import api from '../../services/api';
import { waitlistOpeningLabel, waitlistPreferenceText, waitlistSettingLabel, waitlistWaitingLabel } from './providerEnrollmentWaitlistPresentation.js';
const props = defineProps({
  compact: Boolean,
  hideUnlessEnabled: Boolean,
  providerId: { type: Number, default: null },
  agencyIds: { type: Array, default: () => [] },
  staffView: { type: Boolean, default: false },
  initiallyExpanded: { type: Boolean, default: false },
  refreshKey: { type: Number, default: 0 }
});
const emit = defineEmits(['review', 'loaded']);
const panel = ref(null);
const waitlistEnabled = ref(false);
const closeOutside = event => { if (props.compact && !panel.value?.contains(event.target)) expanded.value = false; };
onMounted(() => document.addEventListener('click',closeOutside));
onBeforeUnmount(() => document.removeEventListener('click',closeOutside));
const expanded = ref(props.initiallyExpanded);
const requests = ref([]);
const error = ref('');
const loading = ref(false);
const loaded = ref(false);
const listId = `provider-waitlist-${useId()}`;
const scopedAgencyIds = computed(() => [...new Set(props.agencyIds.map(Number).filter(id => Number.isInteger(id) && id > 0))].sort((a, b) => a - b));
let generation = 0;
const joinedDate = value => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Join date not recorded'; };
const hasTiming = request => Boolean(waitlistOpeningLabel(request.requestedOpening) || waitlistPreferenceText(request.preferredDays) || waitlistPreferenceText(request.preferredTimes) || request.schedulingNotes);
async function load() {
  const current = ++generation;
  error.value = '';
  if (!scopedAgencyIds.value.length || (!props.staffView && !props.providerId)) { requests.value = []; loaded.value = false; loading.value = false; return; }
  loading.value = true;
  const endpoint = props.staffView ? '/availability/admin/enrollment-waitlist' : `/availability/providers/${props.providerId}/enrollment-waitlist`;
  const result = await Promise.allSettled(scopedAgencyIds.value.map(agencyId => api.get(endpoint, { params: { agencyId }, skipGlobalLoading: true })));
  if (current !== generation) return;
  const successful = result.filter(item => item.status === 'fulfilled');
  const failures = result.filter(item => item.status === 'rejected');
  const unique = new Map();
  for (const item of successful) {
    for (const request of item.value?.data?.requests || []) {
      unique.set(`${request.agencyId}-${request.providerId}-${request.clientId || request.id}`, { ...request, canManage: props.staffView && item.value?.data?.canManage === true });
    }
  }
  // A failed refresh is not evidence that the existing queue is empty or disabled.
  if (successful.length) {
    waitlistEnabled.value = successful.some(item => item.value?.data?.waitlistEnabled === true);
    requests.value = [...unique.values()].sort((a, b) => new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0));
    loaded.value = true;
  }
  loading.value = false;
  if (failures.length) error.value = successful.length ? 'Some agency waitlists could not be loaded. The count may be incomplete; refresh to try again.' : 'Waitlist requests could not be loaded. Refresh to try again.';
  emit('loaded', { count: requests.value.length, complete: !failures.length });
}
watch(() => `${props.providerId}|${props.staffView}|${scopedAgencyIds.value.join(',')}`, () => {
  requests.value = [];
  waitlistEnabled.value = false;
  loaded.value = false;
  void load();
}, { immediate: true });
watch(() => props.refreshKey, () => { void load(); });
watch(() => props.initiallyExpanded, value => { if (value) expanded.value = true; });
onBeforeUnmount(() => { generation += 1; });
defineExpose({ reload: load });
</script>

<style scoped>
.pew { margin: 12px 0; border: 1px solid #d2e2d8; border-radius: 12px; background: #f5faf7; color: #183e31; overflow: hidden; }
.pew-heading { display: flex; align-items: center; padding: 4px 12px; gap: 12px; }
.pew-toggle { flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 9px; min-height: 46px; padding: 8px 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; font-weight: 650; cursor: pointer; }
.pew-count { display: inline-grid; place-items: center; min-width: 26px; padding: 3px 7px; border-radius: 18px; background: #d7eadd; color: #155437; }
.pew-count-caption,.pew-checking { font-size: 0.83rem; font-weight: 400; color: #536d60; }
.pew-chevron { margin-left: auto; }
.pew-refresh,.pew-review { padding: 8px 11px; border: 1px solid #b8d1c0; background: white; color: #285a40; border-radius: 7px; font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.pew-refresh:disabled { opacity: 0.5; }
.pew-body { padding: 0 16px 16px; max-height: 560px; overflow-y: auto; }
.pew-intro,.pew-empty,.pew-no-times { font-size: 0.86rem; line-height: 1.6; color: #51645c; }
.pew-request { background: #fff; padding: 16px; border: 1px solid #dce7e0; border-radius: 10px; margin-top: 12px; }
.pew-request-heading { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; justify-content: space-between; }
.pew-request-heading h3 { margin: 0; font-size: 1rem; color: inherit; }
.pew-request-heading p { font-size: 0.8rem; color: #62716a; margin: 4px 0 0; }
.pew-waiting { font-size: 0.78rem; border: 1px solid #ead7a9; color: #755b1e; background: #fff9e9; border-radius: 20px; padding: 5px 9px; }
.pew-preferences { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin: 16px 0; }
.pew-preferences dt { font-size: 0.72rem; color: #68786e; margin-bottom: 4px; font-weight: 600; }
.pew-preferences dd { margin: 0; font-size: 0.86rem; line-height: 1.45; overflow-wrap: anywhere; }
.pew-preferences small { display: block; margin-top: 4px; color: #68786e; }
.pew-preference-wide { grid-column: 1 / -1; }
.pew-contact { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 0.82rem; padding-top: 12px; border-top: 1px solid #e7ede8; }
.pew-contact a { color: #185a42; overflow-wrap: anywhere; }
.pew-review { margin-top: 12px; }
.pew-error { margin: 8px 16px 12px; color: #9c3e30; font-size: 0.85rem; }
.pew :focus-visible { outline: 3px solid #268667; outline-offset: 3px; }
@media(max-width:480px) { .pew-heading { gap: 8px; } .pew-count-caption { flex-basis: 75%; } .pew-preferences { grid-template-columns: 1fr; } }
</style>

<style scoped>
.pew--compact{position:relative;margin:0;overflow:visible;flex-shrink:0;}
.pew--compact .pew-heading{padding:0 8px;gap:6px;}
.pew--compact .pew-toggle{min-height:34px;padding:4px;font-size:12px;}
.pew--compact .pew-count-caption,.pew--compact .pew-refresh{display:none;}
.pew--compact .pew-body{position:absolute;z-index:60;top:calc(100% + 8px);left:0;width:min(600px,calc(100vw - 48px));max-height:60vh;box-sizing:border-box;background:var(--bg-primary,#fff);border:1px solid #b8d1c0;border-radius:12px;box-shadow:0 8px 24px #0f172a25;}
</style>
