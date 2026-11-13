<template>
  <div class="invitation-preview">
    <EventPageHero :event="invitation.event" :branding="displayBranding" conversa :status="invitation.event.startsAt ? 'You’re invited' : 'Planning together'" />
    <div class="invitation-preview-grid">
      <section class="ee-card invitation-next-step">
        <div class="invitation-eyebrow"><MessageCircle :size="16" aria-hidden="true" />Your invitation, all in one place</div>
        <h2>Let’s get together.</h2>
        <p>Keep this link for the latest plans. RSVP by replying to your invitation text, or sign in to join the event here.</p>
        <p v-if="invitation.event.potluckEnabled"><strong>It’s a potluck.</strong> Choose a requested item or tell the organizers what you’re bringing. You can update your contribution later.</p>
        <p v-else>See the plans, share your ideas, and keep the conversation going.</p>
        <div class="invitation-feature-list"><span><MessagesSquare :size="16" aria-hidden="true" />Event conversation</span><span><ChartNoAxesColumnIncreasing :size="16" aria-hidden="true" />Event votes</span><span v-if="invitation.event.potluckEnabled"><Utensils :size="16" aria-hidden="true" />Potluck sign-up</span></div>
        <p v-if="signedIn" class="ee-muted">Your account can view these details. Contact the organizer if you should have access to the invitation features.</p>
        <div v-else class="invitation-actions"><a :href="signInUrl" class="ee-button ee-button-primary">{{ invitation.event.potluckEnabled ? 'Sign in to choose what I’m bringing' : 'Sign in to RSVP & join in' }}<ArrowUpRight :size="16" aria-hidden="true" /></a><small>Use your existing work account.</small></div>
        <a v-if="guestRegistrationUrl" :href="guestRegistrationUrl" class="invitation-guest-link">Register as a guest <ArrowUpRight :size="13" aria-hidden="true" /></a>
      </section>
      <section class="ee-card invitation-facts">
        <div class="invitation-eyebrow"><CalendarDays :size="16" aria-hidden="true" />The details</div>
        <h2>A little planning. A great time.</h2>
        <dl>
          <div><dt>Hosted by</dt><dd>{{ invitation.branding.hostAgencyName || invitation.branding.agencyName }}</dd></div>
          <div><dt>Where</dt><dd>{{ [invitation.event.eventLocationName, invitation.event.eventLocationAddress].filter(Boolean).join(' · ') || 'Location to be confirmed' }}</dd></div>
          <div v-if="invitation.event.organizerProviding?.length"><dt>Provided by the hosts</dt><dd>{{ invitation.event.organizerProviding.join(', ') }}</dd></div>
        </dl>
        <p class="invitation-latest"><span aria-hidden="true" /><span>{{ invitation.event.startsAt ? 'Your event team will keep the details here up to date.' : 'The date and time are being decided. Invitees can sign in to vote.' }}</span></p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { MessageCircle, MessagesSquare, ChartNoAxesColumnIncreasing, Utensils, ArrowUpRight, CalendarDays } from '@lucide/vue';
import EventPageHero from './EventPageHero.vue';
const props = defineProps({ invitation: { type: Object, required: true }, signInUrl: { type: String, required: true }, guestRegistrationUrl: {type:String,default:''}, signedIn:{type:Boolean,default:false} });
const displayBranding = computed(() => ({ ...props.invitation.branding, agencies: props.invitation.branding?.agencies || props.invitation.agencies }));
</script>

<style scoped>
.invitation-preview{display:grid;gap:22px}.invitation-preview-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:20px}.invitation-next-step{position:relative;overflow:hidden;border-color:#dce5f9;background:linear-gradient(125deg,#fff,#f7f9ff)}.invitation-eyebrow{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:700;letter-spacing:.6px;color:#4263a6;margin-bottom:17px}.invitation-preview-grid h2{font-size:25px;letter-spacing:-.7px}.invitation-next-step p,.invitation-facts p{font-size:13px;line-height:1.8;color:#53627a;margin:15px 0}.invitation-feature-list{display:flex;gap:10px 17px;flex-wrap:wrap;margin:23px 0;color:#385387}.invitation-feature-list>span{display:flex;gap:7px;align-items:center;font-size:10px;font-weight:600}.invitation-actions{display:flex;align-items:flex-start;flex-direction:column;gap:10px;margin-top:25px}.invitation-actions small{font-size:10px;color:#6b7891}.invitation-guest-link{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:650;color:#2a50a1;margin-top:18px}.invitation-facts dl{margin:19px 0}.invitation-facts dl>div{display:grid;grid-template-columns:minmax(90px,.5fr) minmax(0,1fr);gap:16px;padding:13px 0;border-bottom:1px solid #edf1f5;font-size:12px;line-height:1.7}.invitation-facts dt{font-weight:650;color:#35455e}.invitation-facts dd{margin:0;overflow-wrap:anywhere;color:#58687f}.invitation-facts .invitation-latest{display:flex;align-items:flex-start;gap:8px;background:#f2f6fc;border-radius:10px;padding:12px;font-size:11px}.invitation-latest>span:first-child{width:6px;height:6px;border-radius:50%;background:#5474b9;margin-top:7px;flex-shrink:0}@media(max-width:800px){.invitation-preview-grid{grid-template-columns:minmax(0,1fr);gap:14px}.invitation-preview{gap:14px}.invitation-preview-grid h2{font-size:22px}.invitation-actions .ee-button{width:100%}.invitation-feature-list{gap:12px 14px}}
</style>
