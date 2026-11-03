<template>
 <section class="demo-tasks" data-analytics-area="tasks" @click.capture="intercept" @submit.capture.prevent="notice">
  <header class="demo-tasks-heading"><div><h1>Tasks &amp; To-do</h1><p>Keep follow-ups and shared lists together. Fictional demo changes and completion are simulated.</p></div><nav aria-label="Demo task tools"><RouterLink :to="`/${slug}/tasks`">Tasks</RouterLink><RouterLink :to="`/${slug}/tasks?view=shared`">To-do lists</RouterLink></nav></header>
  <p v-if="route.query.listId && !selectedList" role="alert">This list is not included in the fictional demo. Choose Tasks or To-do lists to continue.</p>
  <TaskListView v-else-if="selectedList" :key="selectedList.id" :list="selectedList" @close="router.replace({path:`/${slug}/tasks`,query:{view:'shared'}})" />
  <TasksHub v-else :key="route.query.view === 'shared' ? 'lists' : 'tasks'" embedded hide-timeline />
 </section>
</template>
<script setup>
import {computed} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import TasksHub from '../../components/tasks/TasksHub.vue';
import TaskListView from '../../components/dashboard/TaskListView.vue';
import {demoTaskLists} from './fixtures';
const route=useRoute(),router=useRouter(),slug=computed(()=>String(route.params.organizationSlug));
const selectedList=computed(()=>demoTaskLists.find(list=>list.id===Number(route.query.listId)));
function notice(){window.dispatchEvent(new CustomEvent('aw-demo-notice',{detail:'Demo only: task changes and completion are simulated. Nothing is saved, assigned or sent.'}));}
function intercept(event){const button=event.target.closest?.('button');if(!button)return;const label=[button.textContent,button.title,button.getAttribute('aria-label')].join(' ').trim();if(button.matches('.task-row__done-btn,.target-count-btn,.btn-done')||/^(?:Save|Add task|Create list|Create project|Mark complete|Complete|Reopen|Delete|Send|Claim)/i.test(label)){event.preventDefault();event.stopImmediatePropagation();notice();}}
</script>
<style scoped>
.demo-tasks{min-width:0}.demo-tasks-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:20px}.demo-tasks-heading h1{margin-bottom:8px}.demo-tasks-heading p{color:#526986;font-size:14px}.demo-tasks-heading nav{display:flex;gap:12px}.demo-tasks-heading nav a{padding:10px;border:1px solid #dce5ee;border-radius:8px;background:white}.demo-tasks :deep(.tasks-hub){background:white;border:1px solid #dce5ee;border-radius:12px;padding:18px}.demo-tasks :deep(.tasks-hub__main){min-width:0}.demo-tasks :deep(.tasks-list-table){overflow-x:auto}.demo-tasks :deep(.side-panel){z-index:1000}.demo-tasks :deep(.tasks-hub__tabs){overflow-x:auto}.demo-tasks :deep(.task-list-view-overlay){min-width:0}@media(max-width:760px){.demo-tasks :deep(.tasks-hub){padding:10px}.demo-tasks-heading p{font-size:12px}.demo-tasks-heading nav{width:100%}}
</style>
