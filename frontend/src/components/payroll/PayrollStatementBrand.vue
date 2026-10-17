<template>
  <div class="statement-brand">
    <div class="statement-employer"><img v-if="logo&&!failed" :src="logo" alt="" @error="failed=true"/><div><small>Employing agency</small><strong>{{agency?.name || 'Selected agency'}}</strong></div></div>
    <div class="statement-finance"><img src="/assets/fundthred/wordmark.svg" alt="FundThred"/><small>Finance operations by Plot Twist Co.</small></div>
  </div>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import {toUploadsUrl} from '../../utils/uploadsUrl';
const props=defineProps({agency:Object});
const failed=ref(false);
const logo=computed(()=>{const value=props.agency?.icon_file_path||props.agency?.logo_url;return value?(/^\/assets\//.test(value)?value:toUploadsUrl(value)):null;});
watch(logo,()=>{failed.value=false;});
</script>
<style scoped>
.statement-brand{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:18px 0;margin-bottom:18px;border-bottom:1px solid #d7e4e8}.statement-employer{display:flex;align-items:center;gap:14px}.statement-employer>img{width:54px;height:54px;object-fit:contain}.statement-employer strong{display:block;font-size:19px}.statement-brand small{display:block;font-size:11px;color:#52677a;margin:4px 0}.statement-finance{text-align:right}.statement-finance img{display:block;width:135px;height:38px;object-fit:contain;margin-left:auto}@media(max-width:520px){.statement-brand{align-items:flex-start;flex-direction:column;gap:12px}.statement-finance{text-align:left}.statement-finance img{margin-left:0}}
</style>
