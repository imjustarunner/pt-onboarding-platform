<template>
  <section class="intake-provider-request" :aria-label="spanish ? 'Profesional solicitado' : 'Requested provider'">
    <img v-if="photo && !photoFailed" :src="photo" alt="" @error="photoFailed = true" />
    <div class="intake-provider-request-copy">
      <span class="intake-provider-request-label">{{ spanish ? 'Profesional solicitado' : 'Requested provider' }}</span>
      <strong>{{ provider?.displayName || provider?.name || (spanish ? 'Su profesional seleccionado' : 'Your selected provider') }}</strong>
      <ProviderLanguageBadges :details="provider?.details" />
      <div v-if="openingSummary" class="intake-provider-opening">
        <strong>{{ spanish ? 'Horario preferido' : 'Preferred time' }}<span v-if="opening.preferenceOnly"> · {{ spanish ? 'sin reservar' : 'not reserved' }}</span></strong>
        <span>{{ openingSummary.date }} · {{ openingSummary.time }}</span>
        <small>{{ openingSummary.frequency }} · {{ openingSummary.setting }} · {{ openingSummary.timeZone }}</small>
      </div>
      <p>{{ spanish ? 'Nuestro equipo confirmará disponibilidad y coordinará la atención. Esta solicitud no confirma una cita.' : 'Our team will confirm availability and coordinate care. This request does not confirm an appointment.' }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
    </div>
    <button v-if="!readonly" type="button" @click="$emit('remove')">{{ spanish ? 'Quitar preferencia' : 'Remove preference' }}</button>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import ProviderLanguageBadges from '../publicServices/ProviderLanguageBadges.vue';
import { openingPreferencePresentation } from '../../utils/openingPreferencePresentation';
const props = defineProps({ provider: Object, opening: Object, error: String, notice: String, locale: String, readonly: Boolean });
defineEmits(['remove']);
const spanish = computed(() => String(props.locale || '').startsWith('es'));
const openingSummary = computed(() => openingPreferencePresentation(props.opening, spanish.value ? 'es' : 'en-US'));
const photo = computed(() => props.provider?.profilePhotoUrl || props.provider?.photoUrl || '');
const photoFailed = ref(false);
watch(photo, () => { photoFailed.value = false; });
</script>

<style scoped>
.intake-provider-request { display:flex; gap:12px; align-items:flex-start; text-align:left; padding:14px 16px; margin:0 0 16px; border:1px solid #cee1d7; border-radius:12px; background:#f3f8f5; color:#25483c; }
.intake-provider-request > img { width:48px; height:58px; object-fit:cover; object-position:center 20%; border-radius:8px; flex-shrink:0; }
.intake-provider-request-copy { flex:1; min-width:0; }
.intake-provider-request-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#516c61; margin-bottom:4px; }
.intake-provider-request strong { font-size:16px; }
.intake-provider-request :deep(.provider-languages) { display:inline-flex; vertical-align:middle; margin:0 0 0 10px; }
.intake-provider-request p { font-size:12px; line-height:1.55; margin:6px 0 0; }
.intake-provider-opening { display:grid; gap:4px; margin-top:10px; padding:10px 0 4px; border-top:1px solid #d7e5dd; font-size:12px; line-height:1.5; }
.intake-provider-opening strong { font-size:12px; }
.intake-provider-opening strong span, .intake-provider-opening small { font-weight:400; color:#516c61; }
.intake-provider-request button { padding:8px 0 8px 8px; border:0; background:transparent; color:#315f4d; text-decoration:underline; text-underline-offset:3px; font:inherit; font-size:12px; cursor:pointer; }
.intake-provider-request button:focus-visible { outline:2px solid #236b50; outline-offset:4px; }
@media(max-width:540px) { .intake-provider-request { flex-wrap:wrap; padding:12px; gap:10px; } .intake-provider-request-copy { flex-basis:calc(100% - 60px); } .intake-provider-request button { margin-left:auto; padding:5px 0; } }
</style>
