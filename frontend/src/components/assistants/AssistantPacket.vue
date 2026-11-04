<template>
  <div class="assistant-packet">
    <template v-if="Array.isArray(value)">
      <div v-for="(item,index) in value" :key="index" class="assistant-packet__item"><AssistantPacket :value="item" :depth="depth+1" /></div>
      <p v-if="!value.length" class="assistant-packet__empty">No items.</p>
    </template>
    <dl v-else-if="value && typeof value==='object'">
      <template v-for="(item,key) in value" :key="key">
        <dt>{{ label(key) }}</dt><dd><AssistantPacket v-if="depth<7 && item && typeof item==='object'" :value="item" :depth="depth+1" /><span v-else>{{ display(item) }}</span></dd>
      </template>
    </dl>
    <span v-else>{{ display(value) }}</span>
  </div>
</template>
<script setup>
defineProps({ value: { default:null }, depth:{type:Number,default:0} });
const label = key => String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const display = value => value == null ? 'Not supplied' : typeof value === 'boolean' ? value ? 'Yes':'No' : typeof value==='object' ? 'Additional nested data omitted' : String(value);
</script>
<style scoped>
.assistant-packet{font-size:14px;line-height:1.6;overflow-wrap:anywhere;white-space:pre-wrap}.assistant-packet dl{margin:0;display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:9px 18px}.assistant-packet dt{font-weight:700;color:#49616b}.assistant-packet dd{margin:0}.assistant-packet__item+.assistant-packet__item{border-top:1px solid #dfe7ea;margin-top:14px;padding-top:14px}.assistant-packet__empty{color:#637783}@media(max-width:640px){.assistant-packet dl{grid-template-columns:1fr;gap:4px}.assistant-packet dd{margin-bottom:10px}}
</style>
