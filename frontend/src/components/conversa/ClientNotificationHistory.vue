<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ clientId: { type: [Number, String], required: true }, guardian: Boolean, language:{type:String,default:'en'} });
const es=computed(()=>props.language==='es');
const words=(en,spanish)=>es.value?spanish:en;
function timeLabel(value){const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat(es.value?'es-US':'en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);}
function kindLabel(value){return ({guardian_enrollment_invitation:words('Guardian enrollment invitation','Invitación de inscripción del tutor'),guardian_enrollment_reminder:words('Guardian enrollment reminder','Recordatorio de inscripción del tutor')})[value]||String(value||words('Notification','Notificación')).replaceAll('_',' ');}
function statusLabel(value){return ({sent:words('Sent','Enviada'),delivered:words('Delivered','Entregada'),failed:words('Failed','Fallida'),pending:words('Pending','Pendiente'),sending:words('Sending','Enviando'),bounced:words('Bounced','Rechazada')})[value]||value;}
const notifications = ref([]);
const loading = ref(false);
const error = ref('');
const hasMore = ref(false);
let nextOffset = 0;
let request = 0;
async function load(more = false) {
  const current = ++request;
  if (!props.clientId) { notifications.value = [];hasMore.value=false;loading.value=false; return; }
  loading.value = true; error.value = '';
  try {
    const base = props.guardian ? '/guardian-portal/clients' : '/clients';
    const { data } = await api.get(`${base}/${props.clientId}/notification-history`, { params: { offset: more ? nextOffset : 0 }, skipGlobalLoading: true });
    if (current === request) { notifications.value = more ? [...notifications.value, ...(data.notifications || [])] : data.notifications || []; hasMore.value = !!data.hasMore; nextOffset = data.nextOffset || 0; }
  } catch { if (current === request) error.value = words('Communication history could not be loaded.','No se pudo cargar el historial de comunicaciones.'); }
  finally { if (current === request) loading.value = false; }
}
watch(() => props.clientId, () => { notifications.value = [];hasMore.value=false;nextOffset=0; load(); }, { immediate: true });
</script>
<template>
  <section class="shared-notifications">
    <header><h3>{{ words('Communication history','Historial de comunicaciones') }}</h3><button type="button" :disabled="loading" @click="load(false)">{{ words('Refresh','Actualizar') }}</button></header>
    <p>{{ words('Emails, texts, invitations, reminders and portal notifications recorded for this dependent. Guardians with account access can see delivery progress. Private message contents, enrollment answers and personal links remain private.','Correos, textos, invitaciones, recordatorios y notificaciones del portal registrados para este dependiente. Los tutores con acceso pueden ver el progreso de entrega. El contenido privado, las respuestas de inscripción y los enlaces personales siguen siendo privados.') }}</p>
    <p>{{ words('Sent means the message was sent by our delivery service; it does not confirm that someone read it.','Enviada significa que nuestro servicio envió el mensaje; no confirma que alguien lo haya leído.') }}</p>
    <p v-if="loading" role="status">{{ words('Loading communications…','Cargando comunicaciones…') }}</p><p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!notifications.length">{{ words('No communications have been recorded for this dependent yet.','Aún no se han registrado comunicaciones para este dependiente.') }}</p>
    <ol v-else><li v-for="item in notifications" :key="item.id"><div><strong>{{ kindLabel(item.type) }}</strong><span>{{ item.organization || words('Your organization','Su organización') }} · {{ item.channel }} · {{ statusLabel(item.status) }}</span></div><div><span>{{ words('To','Para') }} {{ item.recipient || words('Account contact','Contacto de la cuenta') }}</span><time>{{ timeLabel(item.occurredAt) }}</time></div></li></ol>
    <button v-if="hasMore" type="button" :disabled="loading" @click="load(true)">{{ words('Load older communications','Cargar comunicaciones anteriores') }}</button>
  </section>
</template>
<style scoped>
.shared-notifications { padding: 20px; margin: 20px 0; border: 1px solid var(--conversa-border, #dce5f0); border-radius: 12px; background: var(--conversa-surface, #fff); color: var(--conversa-ink, #172d50); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; } h3 { margin: 0; font-size: 17px; } p { font-size: 13px; line-height: 1.6; color: var(--conversa-muted, #627087); }
button { padding: 7px 12px; border: 1px solid var(--conversa-border, #dce5f0); border-radius: 7px; background: transparent; color: inherit; cursor: pointer; } ol { list-style: none; padding: 0; max-height: 440px; overflow: auto; } li { display: flex; justify-content: space-between; gap: 20px; padding: 12px 0; border-top: 1px solid var(--conversa-border, #dce5f0); font-size: 12px; overflow-wrap: anywhere; } li strong { text-transform: capitalize; } li span, time { display: block; margin-top: 4px; color: var(--conversa-muted, #627087); }
@media(max-width:600px) { li { flex-direction: column; gap: 4px; } }
</style>
