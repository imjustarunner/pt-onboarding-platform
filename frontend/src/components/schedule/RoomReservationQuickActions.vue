<template>
  <span v-if="context && status === 'reserved'" class="room-card-usage" role="group" aria-label="Confirm room use" @pointerdown.stop @mousedown.stop @click.stop @dblclick.stop>
    <button type="button" :disabled="pending" @click.stop="$emit('change',context,'vacant')">Mark vacant</button>
    <button type="button" :disabled="pending" @click.stop="$emit('change',context,'occupied')">Mark occupied</button>
  </span>
</template>
<script setup>
defineProps({context:Object,status:String,pending:Boolean});
defineEmits(['change']);
</script>
<style scoped>
.room-card-usage{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;white-space:normal}
.room-card-usage button{font:inherit;font-size:10px;line-height:1.3;padding:4px 6px;border:1px solid #8c9baf;border-radius:5px;background:#fff;color:#26384d;cursor:pointer}
.room-card-usage button:disabled{opacity:.6;cursor:wait}.room-card-usage button:focus-visible{outline:2px solid #244b8d;outline-offset:1px}
</style>
