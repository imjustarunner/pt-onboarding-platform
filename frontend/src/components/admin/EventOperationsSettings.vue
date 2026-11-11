<template>
  <section class="event-operations">
    <div class="operations-heading"><span class="section-kicker">OPERATIONS</span><h4>People, access &amp; event costs</h4></div>
    <template v-if="users.length">
      <h4>Event coordinators</h4>
      <p class="hint">Coordinators can manage this event. Search by name, email, role or agency.</p>
      <EventPeoplePicker :users="users" :model-value="modelValue.coordinatorUserIds || []" label="Event coordinators" search-label="Search event coordinators" @update:model-value="update('coordinatorUserIds', $event)" />
    </template>
    <template v-if="showRegistration">
      <h4>Event page &amp; access</h4>
      <div class="privacy-note"><strong>{{ modelValue.publicRegistrationEnabled ? 'Public attendee page enabled' : 'Private invitation page' }}</strong><p>Invited people have a private event page with details, RSVP, polls and potluck sign-ups. They sign in to use it.</p></div>
      <label><input type="checkbox" :checked="modelValue.publicRegistrationEnabled" @change="update('publicRegistrationEnabled', $event.target.checked)" /> Also publish a public attendee page</label>
      <p class="hint">Public RSVP lets people outside the invite list register as guests using a public link. Leave this off for an internal celebration or company gathering.</p>
      <label v-if="modelValue.publicRegistrationEnabled"><input type="checkbox" :checked="modelValue.attendeeCheckInEnabled" @change="update('attendeeCheckInEnabled', $event.target.checked)" /> Allow public attendees to check themselves in on event day</label>
      <label v-if="modelValue.publicRegistrationEnabled"><input type="checkbox" :checked="modelValue.attendeeSmsEnabled" @change="update('attendeeSmsEnabled', $event.target.checked)" /> Offer optional event text updates to public attendees</label>
    </template>
    <details class="additional-operations"><summary>Event fee &amp; outreach commitment</summary>
    <h4>Event fee</h4>
    <p class="hint">Track the fee our organization owes to attend or host this event.</p>
    <label><input type="checkbox" :checked="modelValue.requiresPayment" @change="update('requiresPayment', $event.target.checked)" /> This event requires payment</label>
    <div v-if="modelValue.requiresPayment" class="payment-fields">
      <label>Fee amount in USD (optional)
        <input data-testid="payment-amount" type="number" min="0" max="999999.99" step="0.01" :value="modelValue.paymentAmount" @input="update('paymentAmount', $event.target.value)" />
      </label>
      <label><input data-testid="payment-paid" type="checkbox" :checked="modelValue.paymentPaid" @change="update('paymentPaid', $event.target.checked)" /> Payment completed</label>
      <label>Payment notes (optional)
        <textarea :value="modelValue.paymentNotes" rows="2" maxlength="2000" placeholder="Waiting for payment link, contact, or receipt reference…" @input="update('paymentNotes', $event.target.value)" />
      </label>
    </div>
    <h4>Outreach commitment</h4>
    <label><input type="checkbox" :checked="modelValue.countsTowardOutreachCommitment" @change="update('countsTowardOutreachCommitment', $event.target.checked)" /> Counts toward annual outreach commitment</label>
    <p class="hint">Use for company events that qualify as outreach under the signed amendment. School outreach already qualifies. Recorded attendance counts toward the calendar-year commitment; an RSVP alone does not.</p>
    <label>Staff audience
      <select :value="modelValue.staffAudienceScope" @change="update('staffAudienceScope', $event.target.value)">
        <option value="audience">Event audience</option>
        <option value="outreach_due">Staff with remaining signed annual outreach time</option>
      </select>
    </label>
    <p class="hint">This setting applies to invitations and automatic reminders. The event audience is the people selected in the Invitees step.</p>
    </details>
  </section>
</template>

<script setup>
import EventPeoplePicker from './EventPeoplePicker.vue';
const props = defineProps({ modelValue: { type: Object, required: true }, users: { type: Array, default: () => [] }, showRegistration: { type: Boolean, default: true } });
const emit = defineEmits(['update:modelValue']);
const update = (key, value) => emit('update:modelValue', { ...props.modelValue, [key]: value });
</script>

<style scoped>
.event-operations { color: #24453c; padding: 0; margin: 0; }.operations-heading{margin-bottom:20px}.section-kicker{font-size:12px;letter-spacing:.14em;font-weight:750;color:#5a7466}.operations-heading h4{font-size:18px;margin:7px 0}.privacy-note{border:1px solid #d9e7df;background:#f2f7f3;padding:14px 16px;border-radius:12px;margin-bottom:12px}.privacy-note p{font-size:14px;line-height:1.6;color:#61736a;margin:7px 0 0}.additional-operations{margin-top:24px;border-top:1px solid #e3eae6;padding-top:18px}.additional-operations summary{font-size:13px;font-weight:650;cursor:pointer;color:#3d6253}
h4 { margin: 12px 0 8px; } h4:first-child { margin-top: 0; }
label { display: block; margin: 10px 0; font-size: 14px; }
input:not([type="checkbox"]), textarea, select { display: block; width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; margin-top: 5px; }
select[multiple] { min-height: 90px; } .hint { font-size:14px; color: #64748b; line-height: 1.5; } .payment-fields { padding-left: 18px; }
</style>
