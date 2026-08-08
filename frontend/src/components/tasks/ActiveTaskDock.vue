<template>
  <Teleport to="body">
    <div v-if="store.task" class="atd-wrap">
      <!-- Expanded mini window with full task details -->
      <div v-if="store.expanded" class="atd-expanded">
        <TaskDetailSidePanel
          :item="store.task"
          :agency-id="null"
          :type-defs="[]"
          :lists="store.projectLists"
          :projects="expandedProjects"
          :agency-users="[]"
          @close="store.toggleExpanded()"
          @complete="onComplete"
          @changed="onChanged"
        />
      </div>

      <!-- Docked footer bar -->
      <div class="atd-bar">
        <button type="button" class="atd-bar__main" @click="store.toggleExpanded()">
          <span class="atd-bar__pin">
            <svg viewBox="0 0 24 24"><path d="M12 17v5M8 13h8l-1-7H9l-1 7z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </span>
          <span class="atd-bar__title" :title="store.task.title">{{ store.task.title }}</span>
          <span class="atd-bar__status" :class="`status--${store.task.status || 'pending'}`">
            {{ statusLabel(store.task.status) }}
          </span>
        </button>

        <div class="atd-bar__actions">
          <select
            v-if="store.projectLists.length"
            class="atd-bar__select"
            :value="store.task.task_list_id || ''"
            :disabled="store.saving"
            @change="onMoveList($event.target.value)"
          >
            <option value="">No list</option>
            <option v-for="l in store.projectLists" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
          </select>

          <button
            type="button"
            class="atd-bar__complete"
            :disabled="store.saving"
            @click="completeAndNavigate"
          >
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Complete
          </button>

          <button type="button" class="atd-bar__close" title="Unpin" @click="store.unpin()">×</button>
        </div>
      </div>
      <p v-if="store.error" class="atd-error">{{ store.error }}</p>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useActiveTaskDockStore } from '../../store/activeTaskDock';
import TaskDetailSidePanel from './TaskDetailSidePanel.vue';

const store = useActiveTaskDockStore();
const route = useRoute();
const router = useRouter();

const orgPrefix = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? `/${slug}` : '';
});

const expandedProjects = computed(() => {
  if (!store.task?.project_id) return [];
  return [{ id: store.task.project_id, name: store.task.project_name || 'Project' }];
});

function statusLabel(s) {
  const map = { pending: 'Open', in_progress: 'In Progress', waiting: 'Waiting', completed: 'Completed' };
  return map[s] || 'Open';
}

function onMoveList(val) {
  store.moveToList(val || null);
}

function navigateToOrigin(task) {
  if (!task) return;
  if (task.task_list_id) {
    router.push(`${orgPrefix.value}/tasks/lists/${task.task_list_id}`);
  } else if (task.project_id) {
    router.push(`${orgPrefix.value}/tasks/projects/${task.project_id}`);
  } else {
    router.push(`${orgPrefix.value}/tasks`);
  }
}

async function completeAndNavigate() {
  const task = store.task;
  await store.markComplete();
  navigateToOrigin(task);
}

function onComplete() {
  const task = store.task;
  store.unpin();
  navigateToOrigin(task);
}

function onChanged(updated) {
  if (updated) store.task = { ...store.task, ...updated };
}

onMounted(() => {
  store.restoreFromStorage();
});
</script>

<style scoped>
.atd-wrap {
  --atd-width: 400px;
  position: fixed;
  bottom: 0;
  right: 24px;
  z-index: 900;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.atd-expanded {
  width: var(--atd-width);
  max-width: calc(100vw - 48px);
  height: 520px;
  max-height: 70vh;
  margin-bottom: 10px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.22);
  border: 1px solid #e2e8f0;
}

.atd-expanded :deep(.side-panel) {
  width: 100%;
  height: 100%;
  border-radius: 12px;
}

.atd-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #14532d;
  color: #fff;
  border-radius: 12px 12px 0 0;
  padding: 8px 10px 8px 14px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.18);
  width: var(--atd-width);
  max-width: calc(100vw - 48px);
}

.atd-bar__main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 4px 0;
  font: inherit;
  text-align: left;
}

.atd-bar__pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  opacity: 0.85;
}
.atd-bar__pin svg { width: 14px; height: 14px; }

.atd-bar__title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.atd-bar__status {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.15);
}
.atd-bar__status.status--waiting { background: rgba(251, 191, 36, 0.3); }
.atd-bar__status.status--in_progress { background: rgba(96, 165, 250, 0.3); }
.atd-bar__status.status--completed { background: rgba(74, 222, 128, 0.3); }

.atd-bar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.atd-bar__select {
  font-size: 11px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  max-width: 100px;
  flex-shrink: 0;
}
.atd-bar__select option { color: #0f172a; }

.atd-bar__complete {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #14532d;
  background: #fff;
  border: none;
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.atd-bar__complete svg { width: 11px; height: 11px; }
.atd-bar__complete:hover { background: #dcfce7; }
.atd-bar__complete:disabled { opacity: 0.6; cursor: default; }

.atd-bar__close {
  background: none;
  border: none;
  color: #fff;
  opacity: 0.7;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.atd-bar__close:hover { opacity: 1; }

.atd-error {
  margin: 4px 0 0;
  font-size: 11px;
  color: #dc2626;
  background: #fff;
  padding: 4px 10px;
  border-radius: 6px;
}

@media (max-width: 640px) {
  .atd-wrap { --atd-width: 100%; right: 0; left: 0; }
  .atd-bar { border-radius: 0; }
  .atd-expanded { margin: 0; border-radius: 0; }
  .atd-bar__select { max-width: 90px; }
}
</style>
