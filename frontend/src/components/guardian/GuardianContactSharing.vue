<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import { useFamilyLocale } from '../../composables/useFamilyLocale';
const { locale } = useFamilyLocale();
const props = defineProps({ clientId: { type: [Number, String], required: true } });
const text = (en, es) => locale.value === 'es' ? es : en;
const sharing = ref(null), contacts = ref([]), error = ref(''), notice = ref(''), saving = ref(false);
let generation = 0;
watch(() => props.clientId, async clientId => {
  const run = ++generation; sharing.value = null; contacts.value = []; error.value = ''; notice.value = '';
  if (!Number(clientId)) return;
  try { const { data } = await api.get(`/guardian-portal/clients/${clientId}/contact-sharing`);
    if (run === generation) { sharing.value = { ...data.sharing }; contacts.value = data.contacts; }
  } catch { if (run === generation) error.value = text('Contact sharing could not be loaded.', 'No se pudo cargar la información compartida.'); }
}, { immediate: true });
async function save() {
  if (saving.value || !sharing.value) return;
  const run = generation, clientId = props.clientId; saving.value = true; error.value = ''; notice.value = '';
  try { const { data } = await api.put(`/guardian-portal/clients/${clientId}/contact-sharing`, { sharing: { ...sharing.value } });
    if (run === generation) { contacts.value = data.contacts; notice.value = text('Sharing choices saved.', 'Se guardaron sus preferencias.'); }
  } catch { if (run === generation) error.value = text('Your choices could not be saved. Please try again.', 'No se pudieron guardar sus preferencias. Inténtelo de nuevo.'); }
  finally { saving.value = false; }
}
</script>
<template>
  <section class="guardian-contact-sharing">
    <h3>{{ text('What other guardians can see', 'Lo que pueden ver otros tutores') }}</h3>
    <p>{{ text('Choose which of your contact details to share with other guardians for this dependent. Uncheck anything you want to keep private.', 'Elija qué datos de contacto compartir con otros tutores de este dependiente. Desmarque lo que desea mantener privado.') }}</p>
    <form v-if="sharing" @submit.prevent="save">
      <label><input type="checkbox" v-model="sharing.name" :disabled="saving"> {{ text('Share my name', 'Compartir mi nombre') }}</label>
      <label><input type="checkbox" v-model="sharing.email" :disabled="saving"> {{ text('Share my email address', 'Compartir mi correo electrónico') }}</label>
      <label><input type="checkbox" v-model="sharing.phone" :disabled="saving"> {{ text('Share my phone number', 'Compartir mi teléfono') }}</label>
      <p>{{ text('Your care team can still use your contact details. These choices do not change access permissions or remove information already written in messages or delivered emails.', 'Su equipo de atención aún puede usar sus datos. Estas preferencias no cambian los permisos de acceso ni eliminan información ya escrita en mensajes o correos enviados.') }}</p>
      <button type="submit" :disabled="saving">{{ saving ? text('Saving…', 'Guardando…') : text('Save sharing choices', 'Guardar preferencias') }}</button>
    </form>
    <p v-if="notice" role="status">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p>
    <ul v-if="contacts.length" aria-label="Guardian contacts"><li v-for="contact in contacts" :key="contact.id"><strong>{{ contact.name }}</strong><span v-if="contact.email">{{ contact.email }}</span><span v-if="contact.phone">{{ contact.phone }}</span></li></ul>
  </section>
</template>
<style scoped>
.guardian-contact-sharing{border-top:1px solid #dce4ee;margin-top:24px;padding-top:16px}p{line-height:1.6}label{display:flex;gap:10px;align-items:center;margin:14px 0}input[type=checkbox]{width:20px;height:20px}button{font:inherit;padding:12px 16px;border:1px solid #bdcde0;border-radius:8px;background:#16457c;color:white;cursor:pointer}ul{padding-left:20px}li{margin:14px 0}li span{display:block;overflow-wrap:anywhere}[role=alert]{color:#a12424}
</style>
