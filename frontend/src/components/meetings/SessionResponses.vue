<template>
  <section class="session-responses" aria-label="Shared responses" aria-live="polite">
    <h3>Shared responses <span>({{ responses.length }})</span></h3>
    <p v-if="!responses.length" class="response-hint">Waiting for responses. When someone selects their feelings and shares their answers, they appear here for everyone in this session.</p>
    <article v-for="response in responses" :key="response.id" class="session-response">
      <h4>{{ authorLabel(response) }} <small v-if="response.createdAt">· {{ new Date(response.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}</small></h4>
      <dl><template v-for="(answer, index) in response.payload.answers" :key="index"><dt>{{ questions[index] || `Response ${index + 1}` }}</dt><dd>{{ answer || 'No answer' }}</dd></template></dl>
    </article>
  </section>
</template>
<script setup>
const props = defineProps({ responses: { type: Array, default: () => [] }, questions: { type: Array, default: () => [] } });
function authorLabel(response) {
  if (response.role === 'provider') return 'Host';
  const actors = [...new Set(props.responses.filter(item => item.role !== 'provider').map(item => item.actor || item.role))];
  return actors.length > 1 ? `Guest ${actors.indexOf(response.actor || response.role) + 1}` : 'Guest';
}
</script>
<style scoped>
.session-responses{margin-top:20px;border-top:1px solid #e3e9f0;padding-top:12px}.session-responses h3{margin:8px 0}.session-responses h3 span,.response-hint{color:#64748b;font-size:14px}.session-response{background:#f3f8f6;border-radius:12px;padding:14px;margin:12px 0}.session-response h4{margin:0 0 12px}.session-response small{font-weight:400;color:#64748b}.session-response dl{margin:0}.session-response dt{font-size:13px;font-weight:650;margin-top:10px}.session-response dd{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
