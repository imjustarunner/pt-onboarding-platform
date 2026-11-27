<script setup>
defineProps({ review: Object });
</script>

<template>
  <section class="plan-documentation" aria-label="Treatment plan documentation review">
    <h4>Treatment plan documentation</h4>
    <template v-if="review">
      <p><strong>{{ review.score }}%</strong> documentation quality</p>
      <ul v-if="review.missing.length">
        <li v-for="item in review.missing" :key="item.label">
          <strong>{{ item.label }}</strong> {{ item.message }}
        </li>
      </ul>
      <p v-else>All documentation criteria are met.</p>
    </template>
    <p v-else>No documentation score was recorded for this signed version.</p>
  </section>
</template>

<style scoped>
.plan-documentation { margin-block: 10px; padding: 10px 12px; border-inline-start: 3px solid #819fb8; background: #eef5fa; }
.plan-documentation h4, .plan-documentation p { margin: 0 0 4px; }
.plan-documentation ul { margin: 4px 0 0; padding-inline-start: 20px; }
</style>
