<template>
  <section class="event-operations">
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
    <p class="hint">This setting applies to staff invitations and automatic reminders. Text previews show who is eligible for each message.</p>
    <template v-if="showRegistration">
      <h4>Public registration</h4>
      <label><input type="checkbox" :checked="modelValue.publicRegistrationEnabled" @change="update('publicRegistrationEnabled', $event.target.checked)" /> Publish attendee page and allow public RSVP</label>
      <label v-if="modelValue.publicRegistrationEnabled"><input type="checkbox" :checked="modelValue.attendeeCheckInEnabled" @change="update('attendeeCheckInEnabled', $event.target.checked)" /> Allow attendee self check-in on event day</label>
      <label v-if="modelValue.publicRegistrationEnabled"><input type="checkbox" :checked="modelValue.attendeeSmsEnabled" @change="update('attendeeSmsEnabled', $event.target.checked)" /> Offer optional event text updates</label>
      <p class="hint">Staff and company messages use Campaign 2. Service and program registration messages use Campaign 1. Each recipient must have the required texting consent.</p>
    </template>
    <template v-if="users.length">
      <h4>Event coordinators</h4>
      <p class="hint">Choose staff who can manage this event.</p>
      <select aria-label="Event coordinators" multiple :value="modelValue.coordinatorUserIds.map(String)" @change="update('coordinatorUserIds', Array.from($event.target.selectedOptions).map(option => Number(option.value)))">
        <option v-for="user in users" :key="user.id" :value="String(user.id)">{{ user.label || user.name || [user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(' ') || user.email }}</option>
      </select>
    </template>
  </section>
</template>

<script setup>
const props = defineProps({ modelValue: { type: Object, required: true }, users: { type: Array, default: () => [] }, showRegistration: { type: Boolean, default: true } });
const emit = defineEmits(['update:modelValue']);
const update = (key, value) => emit('update:modelValue', { ...props.modelValue, [key]: value });
</script>

<style scoped>
.event-operations { border: 1px solid #d8dee8; border-radius: 8px; padding: 14px; margin: 14px 0; }
h4 { margin: 12px 0 8px; } h4:first-child { margin-top: 0; }
label { display: block; margin: 10px 0; font-size: 14px; }
input:not([type="checkbox"]), textarea, select { display: block; width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; margin-top: 5px; }
select[multiple] { min-height: 90px; } .hint { font-size: 12px; color: #64748b; line-height: 1.5; } .payment-fields { padding-left: 18px; }
</style>
