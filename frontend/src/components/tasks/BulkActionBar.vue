<template>
  <Teleport to="body">
    <div v-if="count > 0" class="bulk-bar">
      <div class="bulk-bar__inner">
        <span class="bulk-bar__count">{{ count }} selected</span>

        <button type="button" class="bulk-bar__btn bulk-bar__btn--complete" :disabled="busy" @click="$emit('complete')">
          <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Complete
        </button>

        <label v-if="users.length" class="bulk-bar__field">
          <select :disabled="busy" @change="onAssign">
            <option value="" selected disabled>Assign to…</option>
            <option v-for="u in users" :key="u.id" :value="String(u.id)">{{ userLabel(u) }}</option>
          </select>
        </label>

        <label class="bulk-bar__field">
          <input type="date" :disabled="busy" @change="onDueDate" title="Set due date" />
        </label>

        <label class="bulk-bar__field">
          <select :disabled="busy" @change="onPriority">
            <option value="" selected disabled>Priority…</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label v-if="typeDefs.length" class="bulk-bar__field">
          <select :disabled="busy" @change="onType">
            <option value="" selected disabled>Type…</option>
            <option v-for="t in typeDefs" :key="t.id" :value="String(t.id)">{{ t.label }}</option>
          </select>
        </label>

        <label class="bulk-bar__field">
          <select :disabled="busy" @change="onStatus">
            <option value="" selected disabled>Status…</option>
            <option value="pending">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting">Waiting</option>
            <option value="completed">Completed</option>
          </select>
        </label>

        <button type="button" class="bulk-bar__clear" @click="$emit('clear')">Clear</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  count: { type: Number, default: 0 },
  users: { type: Array, default: () => [] },
  typeDefs: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false }
});

const emit = defineEmits(['complete', 'assign', 'due-date', 'priority', 'type', 'status', 'clear']);

function userLabel(u) {
  const name = [u.first_name ?? u.firstName, u.last_name ?? u.lastName].filter(Boolean).join(' ');
  return name || u.email || `User #${u.id}`;
}

function onAssign(ev) {
  const val = ev.target.value;
  if (val === '') return;
  emit('assign', Number(val));
  ev.target.value = '';
}

function onDueDate(ev) {
  const val = ev.target.value;
  if (!val) return;
  emit('due-date', val);
  ev.target.value = '';
}

function onPriority(ev) {
  const val = ev.target.value;
  if (val === '') return;
  emit('priority', val);
  ev.target.value = '';
}

function onType(ev) {
  const val = ev.target.value;
  if (val === '') return;
  emit('type', val);
  ev.target.value = '';
}

function onStatus(ev) {
  const val = ev.target.value;
  if (val === '') return;
  emit('status', val);
  ev.target.value = '';
}
</script>

<style scoped>
.bulk-bar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 940;
}

.bulk-bar__inner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0f172a;
  color: #fff;
  padding: 10px 14px;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.3);
  flex-wrap: wrap;
  max-width: calc(100vw - 32px);
}

.bulk-bar__count {
  font-size: 12px;
  font-weight: 700;
  padding-right: 6px;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
  white-space: nowrap;
}

.bulk-bar__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  background: #16a34a;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.bulk-bar__btn svg { width: 12px; height: 12px; }
.bulk-bar__btn:hover { background: #15803d; }
.bulk-bar__btn:disabled { opacity: 0.6; cursor: default; }

.bulk-bar__field select,
.bulk-bar__field input {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.bulk-bar__field select option { color: #0f172a; }
.bulk-bar__field input[type="date"] { color-scheme: dark; }

.bulk-bar__clear {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
}
.bulk-bar__clear:hover { color: #fff; }

@media (max-width: 700px) {
  .bulk-bar__inner { max-width: calc(100vw - 24px); }
}
</style>
