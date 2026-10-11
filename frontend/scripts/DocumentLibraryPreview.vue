<template>
  <p class="preview-note">Local design preview · Example company only · No assignment or publication</p>
  <WorkplaceDocumentLibrary :catalog="catalog" :companies="companies" :selected-id="selectedId" @select="selectedId = $event">
    <template #workspace><WorkplaceHandbookBook :handbook="handbook" /></template>
  </WorkplaceDocumentLibrary>
</template>
<script setup>
import { ref } from 'vue';
import WorkplaceDocumentLibrary from '../src/components/handbook/WorkplaceDocumentLibrary.vue';
import WorkplaceHandbookBook from '../src/components/handbook/WorkplaceHandbookBook.vue';
defineProps({ catalog: Array, handbook: Object });
const selectedId = ref(31);
const companies = [{ id: 31, name: 'Cedar Studio · Example company', slug: 'cedar', assignment_id: 1, template_version: '1.0.0', draft_version_number: 1 }];
</script>
<style scoped>.preview-note{font:12px Arial,sans-serif;line-height:1.7;color:#607064;margin:0 0 20px}</style>
