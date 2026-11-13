<template>
  <div class="invitation-preview">
    <EventPageHero :event="invitation.event" :branding="invitation.branding" :status="invitation.event.startsAt ? 'You’re invited' : 'Planning together'" />
    <section class="ee-card invitation-next-step">
      <h2>You’re invited</h2>
      <p>Keep this link to see the event details as plans take shape. You can RSVP by replying to your invitation text.</p>
      <p v-if="invitation.event.potluckEnabled"><strong>It’s a potluck.</strong> Sign in to choose a requested item or tell the organizers what you’re bringing. You can update your contribution later.</p>
      <p v-else>Sign in to RSVP, vote, and join the event conversation.</p>
      <a :href="signInUrl" class="ee-button ee-button-primary">{{ invitation.event.potluckEnabled ? 'Sign in to choose what I’m bringing' : 'Sign in to RSVP & join in' }}</a>
    </section>
    <section class="ee-card invitation-facts">
      <h2>Event details</h2>
      <dl>
        <div><dt>Hosted by</dt><dd>{{ (invitation.agencies || []).map(agency => agency.name).join(' + ') || invitation.branding.agencyName }}</dd></div>
        <div><dt>Where</dt><dd>{{ [invitation.event.eventLocationName, invitation.event.eventLocationAddress].filter(Boolean).join(' · ') || 'Location to be confirmed' }}</dd></div>
        <div v-if="invitation.event.organizerProviding?.length"><dt>Provided by the hosts</dt><dd>{{ invitation.event.organizerProviding.join(', ') }}</dd></div>
      </dl>
      <p class="ee-muted">{{ invitation.event.startsAt ? 'The date and location above reflect the latest event details.' : 'The date and time are being decided. Invitees can sign in to vote.' }}</p>
    </section>
  </div>
</template>

<script setup>
import EventPageHero from './EventPageHero.vue';
defineProps({ invitation: { type: Object, required: true }, signInUrl: { type: String, required: true } });
</script>

<style scoped>
.invitation-preview{display:grid;gap:22px}.invitation-next-step p,.invitation-facts p{font-size:14px;line-height:1.7;color:#53627a;margin:14px 0}.invitation-next-step .ee-button{margin-top:5px}.invitation-facts dl{margin:18px 0}.invitation-facts dl>div{display:grid;grid-template-columns:minmax(100px,.3fr) minmax(0,1fr);gap:18px;padding:12px 0;border-bottom:1px solid #edf1f5;font-size:14px}.invitation-facts dt{font-weight:650}.invitation-facts dd{margin:0;overflow-wrap:anywhere}
</style>
