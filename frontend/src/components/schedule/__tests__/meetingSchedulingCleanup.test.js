import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MeetingParticipantsPicker from '../MeetingParticipantsPicker.vue';
import MeetingLocationOptions from '../MeetingLocationOptions.vue';
import VirtualLinkControls from '../VirtualLinkControls.vue';
import TeamMeetingBody from '../TeamMeetingBody.vue';
import AppointmentInfoPanel from '../AppointmentInfoPanel.vue';

const roster = [{ id: 1, firstName: 'Rachel', lastName: 'Smith', email: 'rachel@example.test' }, { id: 2, firstName: 'Alex' }];
const groups = [{ key: 'denver', label: 'Denver', userIds: [1, 2] }, { key: 'staff', label: 'Staff', userIds: ['1'] }, { key: 'other', label: 'Other team', userIds: [2] }];
describe('compact meeting participants', () => {
  const props = { expanded: true, roster, candidates: roster, groups, personLabel: p => `${p.firstName || ''} ${p.lastName || ''}`.trim() };
  it('collapses groups initially, then finds memberships by person name or email', async () => {
    const w = mount(MeetingParticipantsPicker, { props });
    expect(w.findAll('.mpp-group-btn')).toHaveLength(0);
    await w.get('.mpp-browse').trigger('click');
    expect(w.findAll('.mpp-group-btn')).toHaveLength(3);
    await w.setProps({ search: 'Rachel', candidates: [roster[0]] });
    expect(w.findAll('.mpp-group-name').map(n => n.text())).toEqual(['Denver', 'Staff']);
    await w.setProps({ search: 'rachel@example.test', candidates: [] });
    expect(w.findAll('.mpp-group-btn')).toHaveLength(2);
    await w.get('.mpp-group-btn').trigger('click');
    expect(w.emitted('toggle-group')[0]).toEqual([groups[0]]);
    await w.setProps({ search: 'Other team' });
    expect(w.findAll('.mpp-group-name').map(n => n.text())).toEqual(['Other team']);
    await w.setProps({ search: 'Nobody' });
    expect(w.text()).toContain('No groups match');
  });
});
describe('meeting location', () => {
  it('keeps joining available without offering to share a role-based meeting link', () => {
    const w = mount(VirtualLinkControls, { props: { link: '/join/team-meeting/room', allowSharing: false, compact: true } });
    expect(w.get('a').attributes('href')).toBe('/join/team-meeting/room');
    expect(w.text()).toContain('personal invitation');
    expect(w.find('input').exists()).toBe(false);
    expect(w.findAll('button')).toHaveLength(0);
    const panel = mount(AppointmentInfoPanel, { props: { virtualLink: '/join/supervision/room', compactVirtualLink: true, showVirtualLink: true } });
    expect(panel.text()).not.toContain('Copy link');
    expect(panel.get('a[href="/join/supervision/room"]').text()).toBe('Join');
  });
  it('maps each location to an unambiguous combination of existing settings', async () => {
    const w = mount(MeetingLocationOptions, { props: { videoConfigured: true } });
    for (const [value, virtual, platform, meet] of [['platform', true, true, false], ['meet', true, false, true], ['external', true, false, false], ['in_person', false, false, false]]) {
      await w.get('select').setValue(value);
      expect(w.emitted('update:isVirtual').at(-1)).toEqual([virtual]);
      expect(w.emitted('update:usePlatformVideo').at(-1)).toEqual([platform]);
      expect(w.emitted('update:createMeetLink').at(-1)).toEqual([meet]);
    }
  });
  it('supports existing external meetings and hides unavailable platform video', () => {
    const w = mount(MeetingLocationOptions, { props: { isVirtual: true } });
    expect(w.get('select').element.value).toBe('external');
    expect(w.find('option[value="platform"]').exists()).toBe(false);
  });
  it('does not show empty copy/join controls before booking', () => {
    const w = mount(VirtualLinkControls, { props: { showOptions: true, isVirtual: true, videoConfigured: true } });
    expect(w.find('.vlc-row').exists()).toBe(false);
    expect(w.findComponent(MeetingLocationOptions).exists()).toBe(true);
  });
  it('explains each meeting type and the selected type', async () => {
    const w = mount(TeamMeetingBody, { props: { showMeetingSubtype: true, meetingSubtype: 'interview' } });
    expect(w.findAll('.tmb-type-guide dt')).toHaveLength(10);
    expect(w.get('[aria-live="polite"]').text()).toContain('hiring interview');
    await w.setProps({ meetingSubtype: 'evaluation' });
    expect(w.get('[aria-live="polite"]').text()).toContain('exactly one employee');
  });
});
