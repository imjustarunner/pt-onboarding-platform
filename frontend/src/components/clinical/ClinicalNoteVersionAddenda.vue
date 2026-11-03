<template>
  <section v-if="entries.length" class="version-addenda" aria-label="Independent additions included in this review">
    <h4>Separate additions included in this review</h4>
    <p>Each addition keeps its own author, signature and time. These entries do not replace the saved revision narrative.</p>
    <article v-for="(entry, index) in entries" :key="entry.id || index">
      <strong>{{ entryLabel(entry.entryKind || entry.entry_kind) }}<template v-if="entry.id"> · entry #{{ entry.id }}</template></strong>
      <p class="entry-body">{{ entry.body }}</p><p v-if="entry.reason || entry.entry_reason">Reason: {{ entry.reason || entry.entry_reason }}</p>
      <small>{{ entry.createdByName || `User #${entry.createdByUserId || entry.created_by_user_id || 'not recorded'}` }} · {{ signedAt(entry) ? `Author signed ${timestamp(signedAt(entry))}` : 'Author signature not recorded' }}</small>
      <small v-if="entry.signature_content_hash || entry.signatureContentHash">Entry signature fingerprint: {{ entry.signature_content_hash || entry.signatureContentHash }}</small>
      <small v-if="!(entry.revision_signature_id || entry.revisionSignatureId)">Legacy entry evidence; no new signature over this revision is inferred.</small>
    </article>
  </section>
</template>
<script setup>
defineProps({ entries: { type: Array, default: () => [] } });
const signedAt = entry => entry.authorSignedAt || entry.author_signed_at;
const timestamp = value => { const time = new Date(value); return Number.isNaN(time.getTime()) ? String(value) : time.toLocaleString(); };
const entryLabel = kind => ({ addendum: 'Addendum', late_entry: 'Late entry', correction: 'Historical correction entry' }[kind] || 'Separate entry');
</script>
<style scoped>
.version-addenda{margin:12px 0;padding:10px 12px;border:1px solid #c9dce5;border-radius:7px;background:#f1f8fa}.version-addenda h4{margin:0 0 6px;font-size:.84rem}.version-addenda>p{font-size:.76rem;line-height:1.4}.version-addenda article{border-top:1px solid #d6e5eb;padding:10px 0}.entry-body{white-space:pre-wrap;line-height:1.5}.version-addenda small{display:block;margin-top:5px;color:#526d7e;overflow-wrap:anywhere}
</style>
