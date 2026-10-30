<template>
  <section class="enrollment-start" aria-labelledby="enroll-title">
    <h2 id="enroll-title">{{ tx('Enroll a child or yourself', 'Inscribir a un hijo o a usted mismo') }}</h2>
    <p>{{ tx('Start a new enrollment using your current account. Your existing profiles and documents stay available.', 'Inicie una nueva inscripción con su cuenta actual. Sus perfiles y documentos existentes seguirán disponibles.') }}</p>
    <p>{{ tx('For a child, you can invite another parent to complete their own information after you submit.', 'Para un hijo, puede invitar al otro padre o madre a completar su propia información después de enviar su inscripción.') }}</p>
    <p v-if="loading" role="status">{{ tx('Loading enrollment options…', 'Cargando opciones de inscripción…') }}</p>
    <p v-if="error" role="alert">{{ error }} <button v-if="!options.length" type="button" @click="load">{{ tx('Retry', 'Reintentar') }}</button></p>
    <form v-if="!loading && options.length" @submit.prevent="start">
      <fieldset :disabled="starting">
        <legend>{{ tx('Who needs services?', '¿Quién necesita servicios?') }}</legend>
        <label><input v-model="subject" type="radio" value="dependent" /> {{ tx('My child or children', 'Mi hijo o mis hijos') }}</label>
        <label><input v-model="subject" type="radio" value="self" /> {{ tx('Myself', 'Yo') }}</label>
      </fieldset>
      <label class="form-choice">{{ tx('Where would you like to enroll?', '¿Dónde desea inscribirse?') }}
        <select v-model="linkId" :disabled="starting" required>
          <option value="">{{ tx('Choose an enrollment', 'Elija una inscripción') }}</option>
          <option v-for="option in available" :key="option.id" :value="option.id">{{ option.agencyName }} · {{ option.channel === 'school' ? option.organizationName : tx('Office or virtual services', 'Servicios en oficina o virtuales') }} · {{ option.language === 'es' ? 'Español' : 'English' }}</option>
        </select>
      </label>
      <p v-if="!available.length">{{ tx('No enrollment is available for this choice. Please contact your care team.', 'No hay una inscripción disponible para esta opción. Comuníquese con su equipo de atención.') }}</p>
      <button class="start-button" type="submit" :disabled="starting || !linkId">{{ starting ? tx('Opening enrollment…', 'Abriendo inscripción…') : tx('Start enrollment', 'Iniciar inscripción') }}</button>
    </form>
    <p v-else-if="!loading && !error">{{ tx('No enrollment forms are currently available. Please contact your care team.', 'No hay formularios de inscripción disponibles actualmente. Comuníquese con su equipo de atención.') }}</p>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
const props = defineProps({ agencyId: [Number, String], language: { type: String, default: 'en' } });
const router = useRouter();
const tx = (en, es) => props.language === 'es' ? es : en;
const options = ref([]), loading = ref(true), starting = ref(false), error = ref('');
const subject = ref('dependent'), linkId = ref('');
const available = computed(() => options.value.filter(o => subject.value !== 'self' || o.channel !== 'school'));
watch(available, rows => {
  if (rows.some(o => o.id === Number(linkId.value))) return;
  linkId.value = rows.find(o => o.agencyId === Number(props.agencyId) && o.language === props.language && o.channel === 'office')?.id || '';
});
async function load() {
  loading.value = true; error.value = '';
  try { options.value = (await api.get('/guardian-portal/enrollments/options')).data.options || []; }
  catch (e) { error.value = e.response?.data?.error?.message || tx('Enrollment options could not be loaded.', 'No se pudieron cargar las opciones de inscripción.'); }
  finally { loading.value = false; }
}
async function start() {
  if (starting.value || !available.value.some(o => o.id === Number(linkId.value))) return;
  starting.value = true; error.value = '';
  try {
    const { data } = await api.post('/guardian-portal/enrollments', { linkId: Number(linkId.value), subject: subject.value });
    if (!/^\/intake\/[^/?#]+\?session=[a-f0-9]+$/.test(data.path || '')) throw new Error('Invalid enrollment path');
    await router.push(data.path);
  } catch (e) { error.value = e.response?.data?.error?.message || tx('Enrollment could not be opened. Please try again.', 'No se pudo abrir la inscripción. Inténtelo de nuevo.'); }
  finally { starting.value = false; }
}
onMounted(load);
</script>

<style scoped>
.enrollment-start{max-width:760px;padding:24px;background:#fff;border:1px solid #d7e3ef;border-radius:14px}.enrollment-start h2{margin-top:0;color:#173451}.enrollment-start p{line-height:1.6}.enrollment-start fieldset{border:0;padding:0;margin:24px 0;display:flex;flex-wrap:wrap;gap:18px}.enrollment-start legend{font-weight:600;margin-bottom:12px}.form-choice{display:grid;gap:8px}.form-choice select{width:100%;padding:12px;border:1px solid #9aadc1;border-radius:8px;background:#fff;font:inherit}.start-button{margin-top:20px;padding:12px 20px;border:0;border-radius:8px;color:#fff;background:#245d91;font:inherit;cursor:pointer}.start-button:disabled{opacity:.6;cursor:default}[role=alert]{color:#a12727}
</style>
