<template>
 <div class="its-profile-placeholders" aria-busy="true" aria-label="Updating provider profiles">
  <div v-for="n in 3" :key="n" class="its-profile-placeholder" aria-hidden="true">
   <div class="placeholder-top"><div class="placeholder-photo"/><div><div class="placeholder-line title"/><div class="placeholder-line"/><div class="placeholder-tags"><i/><i/></div></div></div>
   <div class="placeholder-line"/><div class="placeholder-line"/><div class="placeholder-line short"/>
   <div class="placeholder-actions"><i/><i/></div>
  </div>
 </div>
</template>
<style scoped>
.its-profile-placeholders{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:24px 0;min-height:340px}
.its-profile-placeholder{border:1px solid #dae7e2;border-radius:20px;padding:20px;background:#fff}
.placeholder-top{display:grid;grid-template-columns:76px 1fr;gap:16px;margin-bottom:28px;align-items:center}
.placeholder-photo{height:96px;border-radius:14px;background:#eaf2ee}
.placeholder-line{height:10px;margin:12px 0;border-radius:8px;background:#edf3f0}
.placeholder-line.title{height:16px;width:80%;background:#dceae3}.placeholder-line.short{width:65%}
.placeholder-tags,.placeholder-actions{display:flex;gap:8px}.placeholder-tags i{width:60px;height:22px;border-radius:20px;background:#eef5f1}
.placeholder-actions{margin-top:42px}.placeholder-actions i{width:50%;height:38px;border:1px solid #deebe4;border-radius:24px}
@media(max-width:800px){.its-profile-placeholders{grid-template-columns:1fr}.its-profile-placeholder:not(:first-child){display:none}}
</style>
