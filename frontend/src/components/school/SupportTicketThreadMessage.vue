<template>
  <div class="msg" :style="{ marginLeft: depth * 16 + 'px' }">
    <div class="msg-top">
      <div class="msg-author">
        <strong>{{ author(node) }}</strong>
        <span class="muted">• {{ fmt(node.created_at) }}</span>
      </div>
      <div class="msg-actions">
        <button v-if="!isDeleted" class="btn-link" type="button" @click="$emit('reply', node)">Reply</button>
        <button v-if="canDelete" class="btn-link danger" type="button" @click="$emit('delete', node)">Delete</button>
      </div>
    </div>

    <div v-if="isDeleted" class="msg-deleted">Deleted message</div>
    <div v-else class="msg-body">{{ node.body }}</div>

    <div v-if="(node.children || []).length > 0" class="msg-children">
      <SupportTicketThreadMessage
        v-for="c in node.children"
        :key="c.id"
        :node="c"
        :depth="depth + 1"
        :current-user-id="currentUserId"
        :current-user-role="currentUserRole"
        @reply="$emit('reply', $event)"
        @delete="$emit('delete', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
defineOptions({ name: 'SupportTicketThreadMessage' });

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  currentUserId: { type: [Number, String], default: null },
  currentUserRole: { type: String, default: '' }
});

defineEmits(['reply', 'delete']);

const fmt = (dt) => (dt ? new Date(dt).toLocaleString() : '');

const author = (m) => {
  const fn = String(m?.author_first_name || '').trim();
  const ln = String(m?.author_last_name || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  if (name) return name;
  const r = String(m?.author_role || '').trim();
  return r ? r.replace(/_/g, ' ') : 'User';
};

const isDeleted = computed(() => {
  const v = props.node?.is_deleted;
  return v === 1 || v === true;
});

const canDelete = computed(() => {
  const role = String(props.currentUserRole || '').toLowerCase();
  const isAdminLike = role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff';
  const isSchoolStaff = role === 'school_staff';
  const authorRole = String(props.node?.author_role || '').toLowerCase();
  const authorUserId = props.node?.author_user_id;
  if (isAdminLike) return authorRole === 'school_staff';
  if (isSchoolStaff) return authorRole === 'school_staff' && Number(authorUserId) === Number(props.currentUserId);
  return false;
});
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

.btn-link.danger {
  color: #b91c1c;
}

.msg-deleted {
  font-style: italic;
  color: var(--text-secondary);
}
</style>

