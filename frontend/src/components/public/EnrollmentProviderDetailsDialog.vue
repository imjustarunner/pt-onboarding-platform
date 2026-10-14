<template>
  <Teleport to="body">
    <div class="epd-backdrop" @click.self="emit('close')">
      <section ref="dialog" class="epd-dialog" role="dialog" aria-modal="true" :aria-labelledby="headingId" tabindex="-1" @keydown="handleKeydown">
        <header class="epd-header">
          <img v-if="providerPhoto(details) && !photoFailed" class="epd-avatar" :src="providerPhoto(details)" alt="" @error="photoFailed = true" />
          <span v-else class="epd-avatar epd-initials" aria-hidden="true">{{ providerInitials(details) }}</span>
          <div><h2 :id="headingId">{{ details.displayName || details.name }}</h2><p>{{ details.credential || details.title || details.credentials }}</p><span class="epd-status">{{ status === 'waitlist' ? 'Waitlist' : status === 'closed' ? 'Closed to new clients' : 'Open to new clients' }}</span></div>
          <button ref="closeButton" type="button" class="epd-close" aria-label="Close provider profile" @click="emit('close')">×</button>
        </header>
        <div class="epd-content">
          <p v-if="loading" class="epd-muted" role="status">Loading profile details…</p>
          <p v-if="error" class="epd-muted" role="status">{{ error }}</p>
          <section class="epd-about"><h3>About {{ details.firstName || details.displayName || details.name }}</h3><p>{{ biography || 'Our care team can share more about this provider and help you decide whether they are a good fit.' }}</p></section>
          <div class="epd-facets">
            <section v-for="group in groups" :key="group.title"><h3>{{ group.title }}</h3><ul><li v-for="value in group.values" :key="value">{{ value }}</li></ul></section>
          </div>
          <a v-if="psychologyTodayHref(details.psychologyTodayUrl)" :href="psychologyTodayHref(details.psychologyTodayUrl)" target="_blank" rel="noopener noreferrer">Psychology Today profile ↗</a>
        </div>
        <footer class="epd-footer">
          <p>{{ disclaimer }}</p>
          <p v-if="selectionDisabled">You have selected three preferences. Remove one before choosing another provider.</p>
          <div><button type="button" class="epd-button" @click="emit('close')">Back to providers</button><button v-if="status !== 'closed'" type="button" class="epd-button epd-button-primary" :disabled="selectionDisabled" @click="emit('select')">{{ selected ? 'Remove preference' : status === 'waitlist' ? 'Choose this waitlist' : 'Prefer this provider' }}</button></div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import api from '../../services/api';
import { publishedFocus } from '../../navigation/providerFocus.js';
import { sessionLanguageLabels } from '../../navigation/providerLanguages.js';
import { psychologyTodayHref } from '../../utils/psychologyTodayUrl.js';
import { intakeProviderStatus, providerInitials, providerPhoto, providerSessionFormats } from './intakeProviderPresentation.js';

const props = defineProps({
  provider: { type: Object, required: true },
  agencySlug: { type: String, default: '' },
  serviceType: { type: String, default: 'counseling' },
  modality: { type: String, default: 'ALL' },
  selected: { type: Boolean, default: false },
  selectionDisabled: { type: Boolean, default: false },
  disclaimer: { type: String, default: 'Selecting a provider does not guarantee placement. Our support team or a care coordinator will reach out to coordinate care.' }
});
const emit = defineEmits(['close', 'select']);
const headingId = `enrollment-provider-${useId()}`;
const dialog = ref(null);
const closeButton = ref(null);
const photoFailed = ref(false);
const loading = ref(false);
const error = ref('');
const loaded = ref(null);
const profile = computed(() => loaded.value?.profile || props.provider.profile || {});
const details = computed(() => ({ ...props.provider, ...loaded.value?.provider }));
// Intake eligibility is scoped to the family's chosen format, supplied by the matching endpoint.
const status = computed(() => intakeProviderStatus(props.provider, props.modality));
const biography = computed(() => profile.value.publicBlurb || props.provider.publicBlurb || details.value.bio || '');
const groups = computed(() => {
  const person = details.value;
  const publicDetails = profile.value.details || person.details || {};
  const focus = publicDetails.clinicalFocus || props.provider.clinicalFocus;
  const asList = value => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean) : [];
  const groups = [
    { title: 'Session format', values: providerSessionFormats(props.provider, props.modality) },
    { title: props.serviceType === 'tutoring' ? 'Subjects' : 'Highlighted specialties', values: props.serviceType === 'tutoring' ? asList(person.tutoringProfile?.subjectAreas) : publishedFocus('specialties', focus, asList(person.specialties)).top },
    { title: 'Client ages', values: publishedFocus('ageGroups', focus, asList(person.ageGroups || person.ageSpecialty)).top },
    { title: 'Populations served', values: publishedFocus('populations', focus, asList(person.focus || person.populations)).top },
    { title: 'Therapy approaches', values: publishedFocus('modalities', focus, asList(person.modalities)).top },
    { title: 'Locations', values: asList(person.officeLocations || publicDetails.locations) },
    { title: 'Insurance accepted', values: asList(profile.value.insurancesAccepted || profile.value.insurances || person.insurances) },
    { title: 'Session languages (self-reported)', values: sessionLanguageLabels(publicDetails) }
  ];
  return groups.filter(group => group.values.length);
});
let returnFocus;
let bodyOverflow;
let mounted = true;

function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.value.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')].filter(element => !element.disabled);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first?.focus();
  }
}

onMounted(async () => {
  returnFocus = document.activeElement;
  bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  await nextTick();
  if (!mounted) return;
  closeButton.value?.focus();
  if (!props.agencySlug) return;
  loading.value = true;
  try {
    const response = await api.get(`/public/agency-services/${encodeURIComponent(props.agencySlug)}/providers/${Number(props.provider.id)}`, {
      params: { serviceType: props.serviceType, bookingMode: 'NEW_CLIENT' },
      skipAuthRedirect: true,
      skipGlobalLoading: true
    });
    if (mounted) loaded.value = response.data;
  } catch {
    if (mounted) error.value = 'Some profile details could not be loaded. You can still review this provider or return to your enrollment.';
  } finally {
    if (mounted) loading.value = false;
  }
});
onBeforeUnmount(() => {
  mounted = false;
  document.body.style.overflow = bodyOverflow || '';
  if (returnFocus?.isConnected) returnFocus.focus();
});
</script>

<style scoped>
.epd-backdrop { position: fixed; inset: 0; z-index: 15000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgb(15 31 35 / 50%); font-family: system-ui, sans-serif; color: #173a36; }
.epd-dialog { width: min(760px, 100%); max-height: calc(100dvh - 48px); display: flex; flex-direction: column; border-radius: 18px; background: #fff; box-shadow: 0 20px 60px #102c3540; overflow: hidden; }
.epd-header { display: flex; align-items: center; gap: 18px; padding: 24px; border-bottom: 1px solid #e2ebe7; }
.epd-header h2 { margin: 0 0 6px; font-size: 1.5rem; }
.epd-header p { margin: 0 0 8px; color: #526c64; }
.epd-avatar { width: 78px; height: 78px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.epd-initials { display: grid; place-items: center; background: #e5f0ea; font-size: 1.7rem; }
.epd-status { display: inline-block; border-radius: 20px; padding: 5px 10px; background: #edf5ef; font-size: 0.8rem; font-weight: 600; }
.epd-close { margin-left: auto; align-self: flex-start; flex-shrink: 0; width: 42px; height: 42px; border-radius: 50%; border: 1px solid #d6e3db; color: #315747; background: #fff; font-size: 1.7rem; cursor: pointer; }
.epd-content { padding: 24px; overflow-y: auto; min-height: 0; }
.epd-content h3 { font-size: 1rem; margin: 0 0 8px; }
.epd-about { margin-bottom: 24px; }
.epd-about p { line-height: 1.7; margin: 0; color: #49605b; white-space: pre-line; }
.epd-facets { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.epd-facets ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.epd-facets li { border-radius: 16px; background: #f0f5f3; padding: 6px 10px; font-size: 0.86rem; }
.epd-content a { display: inline-block; margin-top: 24px; color: #106451; }
.epd-muted { font-size: 0.88rem; color: #526c64; margin: 0 0 20px; }
.epd-footer { padding: 20px 24px; border-top: 1px solid #e2ebe7; background: #f7faf8; }
.epd-footer p { margin: 0 0 14px; font-size: 0.84rem; line-height: 1.55; color: #49605b; }
.epd-footer>div { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
.epd-button { border: 1px solid #c8dbd1; border-radius: 9px; padding: 11px 15px; background: #fff; color: #235547; font: inherit; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
.epd-button:disabled { opacity: 0.55; cursor: not-allowed; }
.epd-button-primary { background: #12684f; color: #fff; border-color: #12684f; }
.epd-dialog :focus-visible { outline: 3px solid #218970; outline-offset: 3px; }
@media (max-width: 550px) { .epd-backdrop { padding: 12px; } .epd-dialog { max-height: calc(100dvh - 24px); } .epd-header,.epd-content,.epd-footer { padding: 18px; } .epd-avatar { width: 56px; height: 56px; } .epd-header { gap: 12px; } .epd-header h2 { font-size: 1.2rem; } .epd-facets { grid-template-columns: 1fr; } }
</style>
