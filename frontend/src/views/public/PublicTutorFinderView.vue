<template>
  <PublicTeamFinderShell
    service-type="tutoring"
    filter-mode="tutoring"
    page-title="Find a Tutor"
    provider-noun="tutors"
    search-placeholder="Name, subject, or keyword…"
    :subject-options="SUBJECT_OPTIONS"
    :grade-options="GRADE_OPTIONS"
  />
</template>

<script setup>
import PublicTeamFinderShell from '../../components/publicServices/PublicTeamFinderShell.vue';

const SUBJECT_OPTIONS = [
  'Math',
  'Reading',
  'Writing',
  'Science',
  'History',
  'SAT/ACT Prep',
  'Spanish',
  'English',
  'Study Skills',
  'PSAT',
  'AP Courses',
  'College Prep',
  'Other'
];

const GRADE_OPTIONS = ['K–2', '3–5', '6–8', '9–12', 'College'];
</script>
