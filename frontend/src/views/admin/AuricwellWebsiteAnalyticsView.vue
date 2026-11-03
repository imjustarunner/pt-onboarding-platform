<template>
  <main class="auricwell-website-report">
    <h1>AuricWell website activity</h1>
    <p>See what visitors explore on the public website and working demo, including the pages and areas with the longest visible active viewing time.</p>
    <p class="report-context">Collection begins after deployment. These reports contain anonymous aggregate activity; they do not include inquiry answers, search terms or clinical content.</p>
    <PublicWebsiteAnalytics site-slug="auricwell" report-only />
  </main>
</template>
<script setup>
import PublicWebsiteAnalytics from '../../components/public/PublicWebsiteAnalytics.vue';
</script>
<style scoped>
.auricwell-website-report{max-width:1200px;margin:0 auto;padding:28px;color:#183c4b}.auricwell-website-report h1{margin:0 0 12px;font-size:30px}.auricwell-website-report>p{max-width:850px;line-height:1.6}.report-context{font-size:14px;color:#566d78;margin-bottom:24px}@media(max-width:600px){.auricwell-website-report{padding:16px}.auricwell-website-report h1{font-size:25px}}
</style>
