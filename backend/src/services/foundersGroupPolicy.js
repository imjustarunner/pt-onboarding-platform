// Mail domains, including Inner Strength's staff domain, are distinct from
// candidate portal and public website domains.
export const FOUNDERS_GROUPS = Object.freeze({
  itsco: 'founders@itsco.health',
  nlu: 'founders@nextleveluplcc.com',
  tisi: 'founders@innerstrengthin.com',
  plottwistco: 'founders@plottwistco.com'
});

export const NEW_FOUNDERS_GROUPS = Object.freeze([
  FOUNDERS_GROUPS.nlu, FOUNDERS_GROUPS.tisi, FOUNDERS_GROUPS.plottwistco
]);

export const FOUNDERS_GROUP_KEY = 'founders';

export function isFoundersGroup(group) {
  return group.group_key === FOUNDERS_GROUP_KEY && group.last_synced_at
    && !group.contact_id && !group.chat_thread_id && !group.meeting_group_id
    && Object.hasOwn(FOUNDERS_GROUPS, group.slug)
    && String(group.email || '').toLowerCase() === FOUNDERS_GROUPS[group.slug];
}
