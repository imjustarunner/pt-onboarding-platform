<template>
  <section v-if="invitations.length || error" class="guardian-invitations" aria-labelledby="guardian-invitations-title">
    <h2 id="guardian-invitations-title">{{ es ? 'Invitaciones para tutores' : 'Guardian invitations' }}</h2>
    <p>{{ es ? 'Cada tutor completa su propia inscripción. Revise el correo electrónico que proporcionó y corríjalo si es necesario.' : 'Each guardian completes their own enrollment. Review the email address you provided and correct it if needed.' }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <form v-for="invite in invitations" :key="invite.id" @submit.prevent="resend(invite)">
      <div :class="{ failed: isFailed(invite) }" role="status">{{ statusText(invite) }}</div>
      <p v-if="invite.invitedAt || invite.lastSentAt || invite.completedAt" class="invite-dates">
        <span v-if="invite.invitedAt">{{ es ? 'Invitada' : 'Invited' }}: {{ dateText(invite.invitedAt) }}</span>
        <span v-if="invite.lastSentAt"> · {{ es ? 'Último intento' : 'Last delivery attempt' }}: {{ dateText(invite.lastSentAt) }}</span>
        <span v-if="invite.completedAt"> · {{ es ? 'Aceptada' : 'Accepted' }}: {{ dateText(invite.completedAt) }}</span>
      </p>
      <details v-if="invite.history?.length" class="invite-history" open>
        <summary>{{ es ? 'Invitaciones y recordatorios enviados' : 'Invitation and reminder history' }}</summary>
        <ol><li v-for="attempt in invite.history" :key="attempt.id">
          {{ attempt.kind === 'reminder' ? (es ? 'Recordatorio' : 'Reminder') : (es ? 'Invitación' : 'Invitation') }}
          · {{ deliveryLabel(attempt.status) }} · {{ dateText(attempt.occurredAt) }}
        </li></ol>
      </details>
      <p v-if="invite.nextReminderAt && invite.status === 'pending'">{{ es ? 'Próximo recordatorio si aún no termina' : 'Next reminder if enrollment is still incomplete' }}: {{ dateText(invite.nextReminderAt) }}</p>
      <div v-if="invite.canManage" class="invite-actions">
        <label :for="`guardian-email-${invite.id}`">{{ es ? 'Correo del otro tutor' : 'Other guardian’s email' }}
          <input :id="`guardian-email-${invite.id}`" v-model="invite.email" type="email" required maxlength="254" autocomplete="off" :disabled="busy === invite.id || invite.status === 'accepted'" />
        </label>
        <button v-if="invite.status !== 'accepted'" type="submit" :disabled="!!busy">{{ busy === invite.id ? (es ? 'Enviando…' : 'Sending…') : (es ? 'Guardar y reenviar' : 'Save and resend') }}</button>
      </div>
      <p v-else class="invite-readonly">{{ es ? 'Correo del otro tutor' : 'Other guardian’s email' }}: {{ invite.email }} · {{ es ? 'El equipo de apoyo administra esta invitación.' : 'Your support team manages this invitation.' }}</p>
      <p v-if="invite.notice" role="status">{{ invite.notice }}</p>
    </form>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: [Number, String], clientId: [Number,String], language: { type: String, default: 'en' } });
const es = computed(() => props.language === 'es');
const invitations = ref([]), error = ref(''), busy = ref(null);
const isFailed = invite => ['failed','bounced','undelivered','not_sent'].includes(invite.deliveryStatus);
function deliveryLabel(status) { return ({sent:es.value?'Enviada':'Sent',delivered:es.value?'Entregada':'Delivered',failed:es.value?'No enviada':'Failed',bounced:es.value?'Rechazada':'Bounced',pending:es.value?'Pendiente':'Pending',sending:es.value?'Enviando':'Sending'})[status] || status; }
function dateText(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(es.value ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '';
}
function statusText(invite) {
  if (invite.status === 'accepted') return Number(invite.accountConnected)
    ? (es.value ? 'Invitación aceptada. El tutor tiene su propia cuenta conectada al portal.' : 'Invitation accepted. This guardian has their own connected portal account.')
    : (es.value ? 'Invitación aceptada. El equipo puede ayudar con el acceso al portal.' : 'Invitation accepted. Your support team can help with portal access.');
  if (invite.status === 'expired' || (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now())) return invite.canManage
    ? (es.value ? 'La invitación venció. Reenvíela para proporcionar un enlace nuevo.' : 'The invitation expired. Resend it to provide a fresh link.')
    : (es.value ? 'La invitación venció. Contacte al equipo de apoyo para enviar un enlace nuevo.' : 'The invitation expired. Contact your support team for a fresh link.');
  if (isFailed(invite)) return invite.canManage
    ? (es.value ? 'No se pudo entregar la invitación. Verifique la dirección; si es correcta, contacte al equipo de apoyo.' : 'Invitation not delivered. Check the address; if it is correct, contact your support team.')
    : (es.value ? 'No se pudo entregar la invitación. El equipo de apoyo puede revisar la dirección y reenviarla.' : 'Invitation not delivered. Your support team can review the address and resend it.');
  if (invite.deliveryStatus === 'sent' || invite.deliveryStatus === 'delivered') return es.value ? 'Invitación enviada; inscripción pendiente.' : 'Invitation sent; enrollment still pending.';
  return es.value ? 'Invitación pendiente. El equipo de apoyo puede ayudarle.' : 'Invitation pending. Your support team can help.';
}
watch([() => props.agencyId,()=>props.clientId], async ([agencyId,clientId]) => {
  invitations.value = []; error.value = '';
  if (!agencyId) return;
  try { const { data } = await api.get('/guardian-portal/invitations', { params: { agencyId,...(clientId?{clientId}:{}) }, skipGlobalLoading: true }); if (props.agencyId === agencyId && props.clientId===clientId) invitations.value = data.invitations || []; }
  catch { error.value = es.value ? 'No pudimos cargar las invitaciones. Actualice la página o contacte al equipo de apoyo.' : 'We could not load your invitations. Refresh or contact your support team.'; }
}, { immediate: true });
async function resend(invite) {
  if (!invite.canManage || invite.status === 'accepted') return;
  busy.value = invite.id; error.value = ''; invite.notice = '';
  try {
    const { data } = await api.post(`/guardian-portal/invitations/${invite.id}/resend`, { agencyId: props.agencyId, email: invite.email });
    invite.deliveryStatus = data.deliveryStatus;
    invite.status = 'pending'; invite.lastSentAt = new Date().toISOString(); invite.expiresAt = new Date(Date.now() + 21 * 86400000).toISOString();
    invite.notice = data.deliveryStatus === 'sent' ? (es.value ? 'Se envió una nueva invitación. El enlace anterior ya no funciona.' : 'A new invitation was sent. The previous link no longer works.') : statusText(invite);
    const refreshed=await api.get('/guardian-portal/invitations',{params:{agencyId:props.agencyId,...(props.clientId?{clientId:props.clientId}:{})},skipGlobalLoading:true});
    const updated=refreshed.data.invitations?.find(i=>i.id===invite.id);if(updated)Object.assign(invite,updated);
  } catch (e) { invite.notice = e.response?.data?.error?.message || (es.value ? 'No se pudo reenviar. Contacte al equipo de apoyo.' : 'Unable to resend. Please contact your support team.'); }
  finally { busy.value = null; }
}
</script>
<style scoped>
.guardian-invitations{padding:20px;border:1px solid #ccdcd5;border-radius:14px;background:#fff;margin:16px 0;color:#193c35}.guardian-invitations h2{font-size:1.1rem;margin:0 0 8px}.guardian-invitations p{font-size:.9rem}.guardian-invitations form{padding:14px 0;border-top:1px solid #e5ece8}.failed{color:#9b3426;font-weight:600}.invite-actions{display:flex;gap:12px;align-items:flex-end;margin-top:10px}.invite-actions label{display:grid;gap:5px;flex:1;min-width:0;font-size:.85rem}.invite-actions input{box-sizing:border-box;width:100%;padding:10px;border:1px solid #bacbc3;border-radius:7px;font:inherit}.invite-actions button{padding:11px 16px;border:0;border-radius:7px;background:#245b49;color:white;font-weight:600}.invite-actions button:disabled{opacity:.6}@media(max-width:560px){.invite-actions{flex-direction:column;align-items:stretch}}
</style>
