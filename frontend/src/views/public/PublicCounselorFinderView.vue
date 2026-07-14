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
import PublicTeamFinderShell from '../../components/publicServices/PublicTeamFinderShell.vue';

const SPECIALTY_OPTIONS = [
  'Anxiety',
  'Depression',
  'Trauma/PTSD',
  'ADHD',
  'Grief & Loss',
  'Family Conflict',
  'Relationship Issues',
  'LGBTQ+',
  "Women's Issues",
  'Child & Adolescent',
  'Life Transitions',
  'Stress',
  'Self-Esteem',
  'Anger Management',
  'Substance Use'
];

const AGE_GROUP_OPTIONS = [
  'Toddler (0-5)',
  'Children (6-10)',
  'Preteen (11-13)',
  'Teen (14-18)',
  'Adults (18+)',
  'Seniors (65+)'
];
</script>
