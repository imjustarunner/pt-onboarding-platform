<template>
  <div class="msg" :style="{ marginLeft: depth * 16 + 'px' }">
    <div class="msg-top">
      <div class="msg-author">
        <strong>{{ author(node) }}</strong>
        <span class="muted">• {{ fmt(node.created_at) }}</span>
      </div>
      <div class="msg-actions">
        <button class="btn-link" type="button" @click="$emit('reply', node)">Reply</button>
        <button
          v-if="(node.children || []).length > 0"
          class="btn-link"
          type="button"
          @click="$emit('toggle', node.id)"
        >
          {{ isExpanded(node.id) ? 'Collapse' : 'Expand' }} ({{ node.children.length }})
        </button>
      </div>
    </div>

    <div class="msg-body">{{ node.body }}</div>

    <div v-if="(node.children || []).length > 0 && isExpanded(node.id)" class="msg-children">
      <SupportTicketThreadMessage
        v-for="c in node.children"
        :key="c.id"
        :node="c"
        :depth="depth + 1"
        :expanded="expanded"
        @toggle="$emit('toggle', $event)"
        @reply="$emit('reply', $event)"
      />
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'SupportTicketThreadMessage' });

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  expanded: { type: Object, required: true }
});

defineEmits(['toggle', 'reply']);

const fmt = (dt) => (dt ? new Date(dt).toLocaleString() : '');

const author = (m) => {
  const fn = String(m?.author_first_name || '').trim();
  const ln = String(m?.author_last_name || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  if (name) return name;
  const r = String(m?.author_role || '').trim();
  return r ? r.replace(/_/g, ' ') : 'User';
};

const isExpanded = (id) => props.expanded?.[String(id)] !== false;
</script>

<style scoped>
.msg {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.msg-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.msg-actions {
  display: inline-flex;
  gap: 12px;
  align-items: center;
}

.msg-body {
  white-space: pre-wrap;
}

.msg-children {
  margin-top: 10px;
}

.muted {
  color: var(--text-secondary);
}

.btn-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--primary);
  cursor: pointer;
  font-size: 12px;
}
</style>

