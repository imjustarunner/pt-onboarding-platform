<script setup>
import { computed } from 'vue';
import { renderEmailContent } from '../../utils/emailPresentation.js';

const props = defineProps({ body: { type: String, default: '' }, plain: { type: Boolean, default: false } });
const html = computed(() => {
  const isHtml = !props.plain && /<[a-z][^>]*>/i.test(props.body);
  return renderEmailContent(isHtml ? { body_html: props.body } : { body_text: props.body }, {
    collapseQuotes: true, compactLayout: true, simplifyAppChrome: true, loadExternalImages: false
  }).html;
});
</script>

<template><div class="support-body" v-html="html"></div></template>

<style scoped>
.support-body{white-space:pre-wrap;font-size:15px;line-height:1.5;margin-top:7px;min-width:0;overflow-wrap:anywhere}.support-body :deep(p){margin:8px 0}.support-body :deep(img){max-width:100%;height:auto}.support-body :deep(table){display:block;max-width:100%;overflow-x:auto}.support-body :deep(pre){white-space:pre-wrap}.support-body :deep(a){color:#2458ad}.support-body :deep(summary){cursor:pointer;font-size:13px;color:#52677e}
</style>
