<script setup>
defineProps({sections:{type:Array,required:true},version:{type:String,required:true},locale:{type:String,default:'en'}});
</script>
<template>
  <div class="tutoring-agreement-content">
    <p>{{locale.startsWith('es')?'Revise el acuerdo educativo antes de aceptarlo. Los permisos opcionales se presentan por separado.':'Review the educational agreement before accepting. Optional permissions are presented separately.'}}</p>
    <details>
      <summary>{{locale.startsWith('es')?'Leer el acuerdo completo y las políticas familiares':'Read the full agreement and family policies'}} <span>{{version}}</span></summary>
      <section v-for="[title,body] in sections" :key="title"><h3>{{title}}</h3><p>{{body}}</p></section>
    </details>
  </div>
</template>
<style scoped>
.tutoring-agreement-content{line-height:1.65;margin:12px 0;color:#23473b}.tutoring-agreement-content>p{margin:0 0 12px}details{border:1px solid #c7dcd3;border-radius:10px;padding:0 16px;background:#f6faf8}summary{padding:14px 0;min-height:44px;box-sizing:border-box;cursor:pointer;font-weight:650}summary span{display:block;font-size:12px;font-weight:400;color:#50665d}summary:focus-visible{outline:3px solid #17634f;outline-offset:3px}section{margin:16px 0}h3{font-size:16px;margin:0 0 6px}section p{margin:0}
</style>
