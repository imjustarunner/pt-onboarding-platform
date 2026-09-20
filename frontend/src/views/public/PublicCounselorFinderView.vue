<template>
  <PublicTeamFinderShell
    service-type="counseling"
    filter-mode="counseling"
    page-title="Find a Counselor"
    provider-noun="providers"
    search-placeholder="e.g. ADHD, CBT, anxiety…"
    :specialty-options="SPECIALTY_OPTIONS"
    :age-group-options="AGE_GROUP_OPTIONS"
  />
</template>

<script setup>
import {SPECIALTIES as SPECIALTY_OPTIONS,CLIENT_AGES as AGE_GROUP_OPTIONS} from '../../constants/providerClinicalTaxonomy';
import PublicTeamFinderShell from '../../components/publicServices/PublicTeamFinderShell.vue';




</script>
