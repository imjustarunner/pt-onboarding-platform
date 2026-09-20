<template>
 <section class="office-choice" aria-label="Office location">
  <h3>{{ title }}</h3>
  <p v-if="required && !modelValue">Choose a location to see providers who work at that office.</p>
  <div class="office-buttons" role="group" aria-label="Choose an office location">
   <button v-for="office in offices" :key="office.id" type="button" :aria-pressed="String(modelValue)===String(office.id)" @click="$emit('update:modelValue',String(office.id))">
    <span aria-hidden="true">⌖</span><span><strong>{{office.name}}</strong><small v-if="office.address">{{office.address}}</small></span>
   </button>
  </div>
  <p v-if="!offices.length">No assigned office locations are published yet. Contact our team for help finding in-person care.</p>
 </section>
</template>
<script setup>
defineProps({offices:{type:Array,default:()=>[]},modelValue:{type:[String,Number],default:''},required:Boolean,title:{type:String,default:'Choose an office location'}});
defineEmits(['update:modelValue']);
</script>
<style scoped>
.office-choice{margin:18px 0;padding:18px;border:1px solid #cfded8;border-radius:14px;background:#f4f8f6}.office-choice h3{margin:0 0 10px;font-size:20px;color:#173e38}.office-choice p{color:#435e58;font-size:14px}.office-buttons{display:flex;gap:10px;flex-wrap:wrap}.office-buttons button{display:flex;align-items:center;gap:10px;flex:1 1 210px;min-width:0;min-height:54px;padding:12px 16px;text-align:left;border:1px solid #afc8bb;border-radius:10px;color:#174c3e;background:#fff;font:inherit;cursor:pointer}.office-buttons button[aria-pressed=true]{background:var(--its-green,var(--agency-primary-color,#155c47));color:white;border-color:transparent}.office-buttons small{display:block;font-size:12px;margin-top:4px;overflow-wrap:anywhere}.office-buttons button:focus-visible{outline:3px solid #d4a829;outline-offset:3px}
</style>
