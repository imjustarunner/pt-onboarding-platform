<template>
  <section v-if="invitations.length || error" class="guardian-invitations" aria-labelledby="guardian-invitations-title">
    <h2 id="guardian-invitations-title">{{ es ? 'Invitaciones para tutores' : 'Guardian invitations' }}</h2>
    <p>{{ es ? 'Cada tutor completa su propia inscripción. Revise el correo electrónico que proporcionó y corríjalo si es necesario.' : 'Each guardian completes their own enrollment. Review the email address you provided and correct it if needed.' }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <form v-for="invite in invitations" :key="invite.id" @submit.prevent="resend(invite)">
      <div :class="{ failed: isFailed(invite) }" role="status">{{ statusText(invite) }}</div>
      <div class="invite-actions">
        <label :for="`guardian-email-${invite.id}`">{{ es ? 'Correo del otro tutor' : 'Other guardian’s email' }}
          <input :id="`guardian-email-${invite.id}`" v-model="invite.email" type="email" required maxlength="254" autocomplete="off" :disabled="busy === invite.id" />
        </label>
        <button type="submit" :disabled="!!busy">{{ busy === invite.id ? (es ? 'Enviando…' : 'Sending…') : (es ? 'Guardar y reenviar' : 'Save and resend') }}</button>
      </div>
      <p v-if="invite.notice" role="status">{{ invite.notice }}</p>
    </form>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: [Number, String], language: { type: String, default: 'en' } });
const es = computed(() => props.language === 'es');
const invitations = ref([]), error = ref(''), busy = ref(null);
const isFailed = invite => ['failed','bounced','undelivered','not_sent'].includes(invite.deliveryStatus);
function statusText(invite) {
  if (isFailed(invite)) return es.value ? 'No se pudo entregar la invitación. Verifique la dirección; si es correcta, contacte al equipo de apoyo.' : 'Invitation not delivered. Check the address; if it is correct, contact your support team.';
  if (invite.deliveryStatus === 'sent' || invite.deliveryStatus === 'delivered') return es.value ? 'Invitación enviada; inscripción pendiente.' : 'Invitation sent; enrollment still pending.';
  return es.value ? 'Invitación pendiente. El equipo de apoyo puede ayudarle.' : 'Invitation pending. Your support team can help.';
}
watch(() => props.agencyId, async agencyId => {
  invitations.value = []; error.value = '';
  if (!agencyId) return;
  try { const { data } = await api.get('/guardian-portal/invitations', { params: { agencyId }, skipGlobalLoading: true }); if (props.agencyId === agencyId) invitations.value = data.invitations || []; }
  catch { error.value = es.value ? 'No pudimos cargar las invitaciones. Actualice la página o contacte al equipo de apoyo.' : 'We could not load your invitations. Refresh or contact your support team.'; }
}, { immediate: true });
async function resend(invite) {
  busy.value = invite.id; error.value = ''; invite.notice = '';
  try {
    const { data } = await api.post(`/guardian-portal/invitations/${invite.id}/resend`, { agencyId: props.agencyId, email: invite.email });
    invite.deliveryStatus = data.deliveryStatus;
    invite.notice = data.deliveryStatus === 'sent' ? (es.value ? 'Se envió una nueva invitación. El enlace anterior ya no funciona.' : 'A new invitation was sent. The previous link no longer works.') : statusText(invite);
  } catch (e) { invite.notice = e.response?.data?.error?.message || (es.value ? 'No se pudo reenviar. Contacte al equipo de apoyo.' : 'Unable to resend. Please contact your support team.'); }
  finally { busy.value = null; }
}
</script>
<style scoped>
.guardian-invitations{padding:20px;border:1px solid #ccdcd5;border-radius:14px;background:#fff;margin:16px 0;color:#193c35}.guardian-invitations h2{font-size:1.1rem;margin:0 0 8px}.guardian-invitations p{font-size:.9rem}.guardian-invitations form{padding:14px 0;border-top:1px solid #e5ece8}.failed{color:#9b3426;font-weight:600}.invite-actions{display:flex;gap:12px;align-items:flex-end;margin-top:10px}.invite-actions label{display:grid;gap:5px;flex:1;min-width:0;font-size:.85rem}.invite-actions input{box-sizing:border-box;width:100%;padding:10px;border:1px solid #bacbc3;border-radius:7px;font:inherit}.invite-actions button{padding:11px 16px;border:0;border-radius:7px;background:#245b49;color:white;font-weight:600}.invite-actions button:disabled{opacity:.6}@media(max-width:560px){.invite-actions{flex-direction:column;align-items:stretch}}
</style>
