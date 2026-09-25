<template>
  <section id="school-partnership-guide" class="its-section its-wrap" data-analytics-id="school-partnership-guide" data-analytics-label="School Partnership Guide" aria-labelledby="school-guide-title">
    <div class="its-school-guide">
      <div>
        <p class="its-eyebrow">For school leaders &amp; teams</p>
        <h2 id="school-guide-title">Explore a partnership with ITSCO.</h2>
        <p>Get to know our school-based counseling program, how referrals and the school portal work, how information is protected, and the steps to bring ITSCO to your school.</p>
        <div class="its-actions">
          <a class="its-button" :href="guideUrl" target="_blank" rel="noopener" data-analytics-id="view-guide" data-analytics-label="View School Partnership Guide" data-analytics-kind="document_view">View the guide <span class="its-guide-new-tab">(opens a new tab)</span> ↗</a>
          <a class="its-button its-outline" :href="guideUrl" download="ITSCO-School-Partnership-Guide.pdf" data-analytics-id="download-guide" data-analytics-label="Download School Partnership Guide" data-analytics-kind="document_download">Download PDF ↓</a>
        </div>
      </div>
      <div class="its-guide-cover" aria-hidden="true">
        <strong>ITSCO</strong><span>In The School Counselors</span>
        <h3>School<br>Partnership<br>Guide</h3>
        <p>Mental health.<br>Brighter tomorrows.</p>
        <small>4 pages · PDF</small>
      </div>
      <p class="its-guide-format">School Partnership Guide · 4-page PDF · 4.6 MB</p>
    </div>
  </section>
</template>

<script setup>
const guideUrl = '/assets/itsco/ITSCO-School-Partnership-Guide.pdf';
</script>

<style scoped>
.its-school-guide{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:24px 48px;align-items:center;padding:40px;background:#f0f5ef;border:1px solid #d5e2d6;border-radius:20px}
.its-school-guide h2{max-width:650px;margin:10px 0 18px}
.its-school-guide p{max-width:670px;line-height:1.7}
.its-school-guide .its-actions{margin-top:24px}
.its-guide-new-tab{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.its-guide-cover{background:#075b46;color:#fff;min-height:285px;padding:26px;border-radius:4px 14px 14px 4px;box-shadow:8px 8px 0 #d6e0ce;transform:rotate(2deg)}
.its-guide-cover strong{display:block;font-size:30px;letter-spacing:.07em}.its-guide-cover>span{font-size:10px}.its-guide-cover h3{font-size:26px;line-height:1.2;color:#fff;margin:22px 0 14px}.its-school-guide .its-guide-cover p{font-size:12px;color:#e2edda}.its-guide-cover small{display:block;margin-top:20px;font-size:11px;color:#e2edda}
.its-guide-format{grid-column:1/-1;margin:0;font-size:13px;color:#466251}
@media(max-width:700px){.its-school-guide{grid-template-columns:1fr;padding:24px;gap:20px}.its-guide-cover{display:none}.its-school-guide .its-actions{align-items:stretch}.its-school-guide .its-button{text-align:center;justify-content:center}}
</style>
