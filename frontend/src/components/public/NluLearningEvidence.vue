<template>
  <section class="learning-evidence nlu-section nlu-wash" aria-labelledby="learning-evidence-title" data-analytics-id="learning-evidence">
    <div class="nlu-wrap">
      <div class="nlu-section-heading"><p class="nlu-eyebrow">Why we connect learning and well-being</p><h2 id="learning-evidence-title">Support the skill.<br>Support the student.</h2><p>When a task brings frustration or overwhelm, a student may need both a clearer learning step and support to manage the moment.</p></div>
      <div class="nlu-three evidence-studies">
        <article v-for="(study, index) in evidence.studies" :key="study.id" class="nlu-card">
          <span class="evidence-number" aria-hidden="true">0{{ index + 1 }}</span><h3>{{ study.heading }}</h3><p>{{ study.finding }}</p>
          <details><summary>Study context</summary><p>{{ study.limit }}</p></details>
          <a :href="study.url" target="_blank" rel="noopener noreferrer" :aria-label="`Read ${study.title}`">{{ study.citation }} ↗</a>
        </article>
      </div>
      <p class="evidence-context">{{ evidence.context }}</p>
      <div class="nlu-two nlu-space evidence-practice">
        <div><p class="nlu-eyebrow">What that can look like at NLU</p><h3>A small moment.<br>A useful next step.</h3><p>A student feels overwhelmed by a math problem. With support, they practice asking for help, choose a brief pause, then try one manageable step with appropriate instruction. The team reviews what helped.</p></div>
        <div><h3>Care built around the student</h3><p>Our small groups offer opportunities to practice communication, coping and returning to learning. Tutoring addresses academic skills; clinical care follows an individualized plan with qualified providers and licensed oversight. We review academic and emotional goals separately.</p><p>This example illustrates our approach. It is not a promised result or a replacement for an assessment of your student’s needs.</p></div>
      </div>
    </div>
  </section>
</template>
<script setup>
import evidence from '../../content/learning-support-evidence.json';
</script>
<style scoped>
.evidence-studies article{display:flex;flex-direction:column;align-items:flex-start;gap:12px;border-top:4px solid #65b9b1}.evidence-number{color:#365b68;font-size:13px;font-weight:700;letter-spacing:.1em}.evidence-studies h3{margin:0}.evidence-studies p{margin:0}.evidence-studies details{width:100%;font-size:14px;line-height:1.7}.evidence-studies summary{cursor:pointer;color:#253257;font-weight:600;padding:6px 0}.evidence-studies details p{padding:8px 0}.evidence-studies a{margin-top:auto;font-size:12px;line-height:1.8;overflow-wrap:anywhere}.evidence-context{max-width:900px;margin:28px auto 0;font-size:14px;line-height:1.9;text-align:center;color:#445367}.evidence-practice{border-top:1px solid #b5d1ce;padding-top:32px}.evidence-practice h3{font-size:clamp(22px,2.8vw,32px);line-height:1.4}
</style>
