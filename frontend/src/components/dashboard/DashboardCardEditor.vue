<template>
  <div class="dashboard-customizer">
    <button type="button" class="ov-customize" data-tour="dash-customize" :aria-expanded="layout.editMode.value" @click="layout.editMode.value = !layout.editMode.value">Customize dashboard</button>
    <div v-if="layout.editMode.value" class="ov-card-editor" role="group" aria-label="Dashboard cards">
      <div v-for="(key, index) in cardKeys" :key="key" class="card-editor-row">
        <label><input type="checkbox" :checked="!hidden.includes(key)" @change="$emit('toggle', key)" /> {{ labels[key] }}</label>
        <button type="button" :disabled="index === 0" :aria-label="`Move ${labels[key]} up`" @click="move(key, -1)">↑</button>
        <button type="button" :disabled="index === cardKeys.length - 1" :aria-label="`Move ${labels[key]} down`" @click="move(key, 1)">↓</button>
      </div>
      <button type="button" class="reset-cards" @click="layout.resetOrder(); $emit('reset')">Reset layout</button>
    </div>
  </div>
</template>
<script setup>
const props = defineProps({ layout: Object, cardKeys: Array, labels: Object, hidden: { type: Array, default: () => [] } });
defineEmits(['toggle', 'reset']);
function move(key, direction) {
  const neighbor = props.cardKeys[props.cardKeys.indexOf(key) + direction];
  if (!neighbor) return;
  const order = [...props.layout.order.value], from = order.indexOf(key), to = order.indexOf(neighbor);
  [order[from], order[to]] = [order[to], order[from]];
  props.layout.order.value = order;
}
</script>
<style scoped>
.dashboard-customizer { margin: 0 0 18px; min-width: 0; }
.ov-customize,.ov-card-editor button { border:1px solid var(--border,#dce6f2); background:var(--bg-card,#fff); color:var(--text-primary,#243f60); border-radius:7px; padding:8px 12px; font:inherit; cursor:pointer; }
.ov-customize { display:block; margin-left:auto; }
.ov-card-editor { margin-top:12px; padding:14px; border:1px solid var(--border,#dce6f2); border-radius:10px; background:var(--bg-card,#fff); }
.card-editor-row { display:flex; align-items:center; gap:8px; padding:6px 0; }
.card-editor-row label { flex:1; min-width:0; overflow-wrap:anywhere; }
.card-editor-row button:disabled { opacity:.4; cursor:default; }
.reset-cards { margin-top:10px; }
button:focus-visible { outline:2px solid var(--primary,#2467a7); outline-offset:2px; }
</style>
