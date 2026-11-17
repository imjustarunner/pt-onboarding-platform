<template>
  <PublicTeamFinderShell
    service-type="counseling"
    filter-mode="counseling"
    :page-title="directoryOnly ? 'Providers' : 'Find a Counselor'"
    :directory-only="directoryOnly"
    provider-noun="providers"
    search-placeholder="e.g. ADHD, CBT, anxiety…"
    :specialty-options="SPECIALTY_OPTIONS"
    :age-group-options="AGE_GROUP_OPTIONS"
  />
</template>

<script setup>
defineProps({ directoryOnly: { type: Boolean, default: false } });
import {SPECIALTIES as SPECIALTY_OPTIONS,CLIENT_AGES as AGE_GROUP_OPTIONS} from '../../constants/providerClinicalTaxonomy';
import PublicTeamFinderShell from '../../components/publicServices/PublicTeamFinderShell.vue';




</script>
