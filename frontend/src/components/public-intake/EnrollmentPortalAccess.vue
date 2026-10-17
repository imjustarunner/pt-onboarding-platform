<template>
  <section v-if="details || error || loading" class="enrollment-portal" aria-labelledby="enrollment-portal-title">
    <h3 id="enrollment-portal-title">{{ es ? 'Su portal' : 'Your portal' }}</h3>
    <p>{{ es ? 'Abra el enlace de su correo para crear una contraseña y acceder al portal. Si ya tiene una cuenta, puede iniciar sesión con su contraseña actual.' : 'Open the link in your email to choose a password and access your portal. If you already have an account, sign in with your existing password.' }}</p>
    <p v-if="details?.username"><strong>{{ es ? 'Correo de la cuenta:' : 'Account email:' }}</strong> {{ details.username }}</p>
    <div class="portal-actions" v-if="details">
      <a class="btn btn-primary" :href="details.portalLoginUrl">{{ es ? 'Abrir mi portal' : 'Open my portal' }} →</a>
      <button class="btn btn-secondary" type="button" :disabled="sending || cooldown" @click="load(true)">{{ sending ? (es ? 'Enviando…' : 'Sending…') : (es ? 'Enviar enlace para crear contraseña' : 'Email password setup link') }}</button>
    </div>
    <p v-if="loading">{{ es ? 'Preparando el acceso…' : 'Preparing portal access…' }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load(false)">{{ es ? 'Volver a intentar' : 'Try again' }}</button></p>
    <small>{{ es ? 'Revise también la carpeta de correo no deseado. Si el enlace vence, puede solicitar otro desde el inicio de sesión.' : 'Check your spam folder too. If your link expires, request another from the sign-in page.' }}</small>
  </section>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import api from '../../services/api';
const props = defineProps({ publicKey: String, submissionId: [String, Number], sessionToken: String, language: String });
const es = computed(() => props.language === 'es');
const details = ref(null), error = ref(''), notice = ref(''), loading = ref(false), sending = ref(false), cooldown = ref(false);
let timer;
async function load(sendSetupEmail = false) {
  if (sending.value || loading.value || !props.submissionId) return;
  error.value = ''; sending.value = sendSetupEmail; loading.value = !sendSetupEmail;
  try {
    const { data } = await api.post(`/public-intake/${encodeURIComponent(props.publicKey)}/${props.submissionId}/portal-credentials`, { sessionToken: props.sessionToken, sendSetupEmail }, { skipGlobalLoading: true });
    details.value = data;
    if (sendSetupEmail) {
      const sent = data.deliveryStatus === 'sent';
      notice.value = sent ? (es.value ? 'Enlace enviado. Revise su correo para crear la contraseña.' : 'Setup link sent. Check your email to choose your password.') : (es.value ? 'No pudimos confirmar el envío. Use la recuperación de contraseña en el portal o contacte a su agencia.' : 'We could not confirm delivery. Use password recovery on the portal sign-in page or contact your agency.');
      cooldown.value = true; timer = setTimeout(() => { cooldown.value = false; }, 60000);
    }
  } catch (e) {
    error.value = es.value ? 'No pudimos preparar el acceso al portal. Contacte a su agencia si el problema continúa.' : 'We could not prepare portal access. Contact your agency if this continues.';
  } finally { loading.value = false; sending.value = false; }
}
onMounted(() => load(false));
onBeforeUnmount(() => clearTimeout(timer));
</script>
<style scoped>
.enrollment-portal{padding:22px;border:1px solid #cbded5;border-radius:14px;background:#f5faf7;text-align:left;margin:20px 0;color:#203e34}.enrollment-portal h3{margin:0 0 10px}.enrollment-portal p{line-height:1.5;overflow-wrap:anywhere}.portal-actions{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.portal-actions .btn{white-space:normal;display:inline-flex;align-items:center;justify-content:center;padding:11px 16px;border:1px solid #245b49;border-radius:8px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;background:#245b49;color:#fff}.portal-actions .btn-secondary{background:#fff;color:#245b49}.portal-actions .btn:disabled{opacity:.55;cursor:wait}.portal-actions .btn:focus-visible{outline:3px solid #93bbde;outline-offset:3px}.enrollment-portal small{display:block;line-height:1.5}
</style>
