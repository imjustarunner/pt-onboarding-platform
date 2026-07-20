<template>
  <section class="ops-summary" aria-label="Operations summaries">
    <article v-if="showPrograms" class="panel">
      <div class="panel-header">
        <h2>Programs</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.programs)">View All</button>
      </div>
      <div class="stat-rows">
        <div class="stat-row">
          <span>Affiliated Programs</span>
          <strong>{{ programStats.programs || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Learning Orgs</span>
          <strong>{{ programStats.learning || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Training Modules</span>
          <strong>{{ programStats.modules || 0 }}</strong>
        </div>
      </div>
      <div class="cta-row">
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.programs)">
          Program Overview
        </button>
        <button type="button" class="mini-btn" @click="$emit('navigate', paths.events || paths.programs)">
          Program Events
        </button>
      </div>
    </article>

    <article v-if="showCommunications" class="panel">
      <div class="panel-header">
        <h2>Communications Center</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.communications)">Open</button>
      </div>
      <div class="stat-rows">
        <div class="stat-row">
          <span>Unread Messages</span>
          <strong>{{ communications.unread || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Client / SMS</span>
          <strong>{{ communications.clientMessages || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Open Tickets</span>
          <strong>{{ communications.openTickets || 0 }}</strong>
        </div>
      </div>
    </article>

    <article v-if="showPeopleOps" class="panel">
      <div class="panel-header">
        <h2>People Ops Overview</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.hiring)">Review</button>
      </div>
      <div class="stat-rows">
        <div class="stat-row">
          <span>New Applications</span>
          <strong>{{ peopleOps.newApplications || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Employee Onboarding</span>
          <strong>{{ peopleOps.onboarding || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Active Employees</span>
          <strong>{{ peopleOps.activeEmployees || 0 }}</strong>
        </div>
      </div>
    </article>

    <article v-if="showSystemAlerts" class="panel">
      <div class="panel-header">
        <h2>System Alerts</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.notifications)">View</button>
      </div>
      <div class="stat-rows">
        <div class="stat-row">
          <span>High Priority</span>
          <strong class="danger">{{ systemAlerts.highPriority || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Unread Notifications</span>
          <strong>{{ systemAlerts.unread || 0 }}</strong>
        </div>
        <div class="stat-row">
          <span>Delivery Queue</span>
          <strong>{{ systemAlerts.deliveryQueue || 0 }}</strong>
        </div>
      </div>
    </article>

    <article v-if="showTodaysSchedule" class="panel schedule">
      <div class="panel-header">
        <h2>Today's Schedule</h2>
        <button type="button" class="link-btn" @click="$emit('navigate', paths.schedule)">Full Calendar</button>
      </div>
      <div v-if="scheduleLoading" class="empty">Loading schedule…</div>
      <div v-else-if="!scheduleSlots.length" class="empty">No sessions scheduled for today</div>
      <ul v-else class="schedule-list">
        <li
          v-for="(slot, i) in scheduleSlots.slice(0, 6)"
          :key="slot.id || i"
          class="schedule-row"
          @click="$emit('navigate', paths.schedule)"
        >
          <span class="slot-time">{{ slot.time }}</span>
          <div class="slot-info">
            <strong>{{ slot.provider || 'Session' }}</strong>
            <span>{{ slot.client || slot.type || '' }}</span>
          </div>
        </li>
      </ul>
    </article>
  </section>
</template>

<script setup>
defineProps({
  showPrograms: { type: Boolean, default: false },
  showCommunications: { type: Boolean, default: true },
  showPeopleOps: { type: Boolean, default: true },
  showSystemAlerts: { type: Boolean, default: true },
  showTodaysSchedule: { type: Boolean, default: true },
  programStats: { type: Object, default: () => ({}) },
  communications: { type: Object, default: () => ({}) },
  peopleOps: { type: Object, default: () => ({}) },
  systemAlerts: { type: Object, default: () => ({}) },
  scheduleSlots: { type: Array, default: () => [] },
  scheduleLoading: { type: Boolean, default: false },
  paths: { type: Object, default: () => ({}) }
});

defineEmits(['navigate']);
</script>

<style scoped>
.ops-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 0;
}
@media (max-width: 1100px) {
  .ops-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .ops-summary { grid-template-columns: 1fr; }
}
.panel {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
  min-height: 160px;
  display: flex;
  flex-direction: column;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.panel-header h2 {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 800;
  color: var(--ops-primary, #1f6b4a);
}
.link-btn {
  border: none;
  background: none;
  color: var(--ops-primary, #1f6b4a);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.link-btn:hover { text-decoration: underline; }
.stat-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #475569;
}
.stat-row strong {
  font-size: 15px;
  color: #0f172a;
}
.stat-row strong.danger { color: #b91c1c; }
.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
}
.mini-btn {
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 30%, #e2e8f0);
  background: #fff;
  color: var(--ops-primary, #1f6b4a);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.mini-btn:hover {
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 8%, #fff);
}
.empty {
  font-size: 13px;
  color: #94a3b8;
  padding: 8px 0;
}
.schedule-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.schedule-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
}
.schedule-row:last-child { border-bottom: none; }
.slot-time {
  font-size: 12px;
  font-weight: 800;
  color: var(--ops-primary, #1f6b4a);
  min-width: 64px;
}
.slot-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.slot-info strong {
  font-size: 13px;
  color: #0f172a;
}
.slot-info span {
  font-size: 12px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
