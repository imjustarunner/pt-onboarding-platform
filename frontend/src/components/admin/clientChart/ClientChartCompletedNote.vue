<template>
  <ClinicalNoteDetailFetcher
    :note-id="noteId"
    :agency-id="agencyId"
  />
</template>

<script setup>
import ClinicalNoteDetailFetcher from '../../../components/clinical/ClinicalNoteDetailFetcher.vue';

defineProps({
  noteId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null }
});
</script>
