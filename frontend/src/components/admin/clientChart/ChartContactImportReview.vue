<template>
  <section ref="region" tabindex="-1" class="contact-review" aria-label="Review imported contact details">
    <h4>Review contact details</h4>
    <p>TherapyNotes values are selected when supplied. Choose the saved value for any field you want to keep.</p>
    <article v-for="row in comparison.rows" :key="row.index">
      <h5>{{ row.incoming.fullName }}</h5>
      <ul class="contact-status" aria-label="Existing records">
        <li>{{ row.current ? (row.current.active ? 'Contact already on chart' : 'Inactive contact on chart') : 'New contact card' }}</li>
        <li v-if="row.profileExists">Guardian intake profile on file</li>
        <li v-if="row.accountStatus === 'linked'">Guardian portal account already linked</li>
        <li v-else-if="row.accountStatus === 'existing'">Existing portal account can be reused after review</li>
        <li v-else-if="row.accountStatus === 'review'">Portal identity needs review</li>
        <li v-else-if="row.isGuardian && showAccountStatus">No matching portal account found</li>
      </ul>
      <p v-if="row.detailsDiffer">The paste differs from the linked account’s contact details. Review the account separately if its login or phone needs updating.</p>
      <p v-if="row.missing.length">Still missing {{ row.missing.join(' and ') }}.</p>
      <p v-if="row.blocked" role="alert">A name or email matches more than one contact. Review the saved contact cards or paste the contacts separately.</p>
      <RecordFieldComparison v-if="row.current" :sources="sources" :rows="fieldsFor(row)"
        :disabled="disabled || row.blocked" @choose="(field, side) => choose(row.index, field, side)" />
    </article>
    <button type="button" class="ehr-btn-primary" :disabled="disabled || comparison.rows.some(row => row.blocked)"
      @click="$emit('confirm', { token: comparison.token, choices })">Save chosen contact details</button>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue';
import RecordFieldComparison from './RecordFieldComparison.vue';

defineProps({ comparison: { type: Object, required: true }, showAccountStatus: Boolean, disabled: Boolean });
defineEmits(['confirm']);
const choices = reactive({});
const region = ref(null);
defineExpose({ focus: () => region.value?.focus() });
const sources = [{ id: 'current', label: 'On this chart' }, { id: 'incoming', label: 'From TherapyNotes' }];
const fields = { fullName: 'Name', relationshipType: 'Relationship', email: 'Email', phone: 'Preferred phone' };
function fieldsFor(row) {
  return Object.entries(fields).map(([key, label]) => ({
    key, label, selected: choices[row.index]?.[key] ?? row.defaults[key],
    values: { current: row.current[key], incoming: row.incoming[key] },
    unavailable: row.incoming[key] ? [] : ['incoming']
  }));
}
function choose(index, field, side) {
  (choices[index] ||= {})[field] = side;
}
</script>

<style scoped>
.contact-review { border: 1px solid #9dbacb; border-radius: 10px; background: #f5f9fc; padding: 15px; margin: 12px 0; color: #19364f; }
article { padding: 12px 0; border-top: 1px solid #d6e3eb; }
h4, h5 { margin: 0 0 6px; }
h5 { font-size: 1rem; }
p { margin: 6px 0; }
.contact-status { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 7px 0; list-style: none; font-size: .86rem; }
.contact-status li { border-radius: 4px; background: #e3eef4; padding: 4px 7px; }
[role="alert"] { color: #9b2626; }
button { padding: 8px 11px; border: 1px solid #18476b; border-radius: 6px; color: #fff; background: #18476b; font-weight: 600; }
button:disabled { opacity: .55; }
</style>
