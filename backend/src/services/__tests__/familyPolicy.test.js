import { describe, it, expect } from 'vitest';
import { familyEnabled, validateEntry, occurrenceKey, assignedMember, safePhoto } from '../familyPolicy.js';
import { readFileSync } from 'node:fs';
const requestedStatuses=JSON.parse(readFileSync(new URL('../../../../frontend/src/utils/__tests__/familyEventCatalog.expected.json',import.meta.url)))['Status Events'];

describe('family policy', () => {
  it('preserves the selected picture independently of a custom upload and rejects path-like variant IDs',()=>{
    const body={kind:'event',title:'Camping',startAt:'2026-09-15T18:00:00Z',endAt:'2026-09-15T19:00:00Z'};
    expect(validateEntry({...body,metadata:{eventType:'camping',artworkVariant:'camping-tundra-rooftop'}}).metadata).toMatchObject({eventType:'camping',artworkVariant:'camping-tundra-rooftop',artwork:null});
    for(const artworkVariant of ['../image.jpg','https://example.com/image.jpg','a'.repeat(81),{},42])expect(validateEntry({...body,metadata:{artworkVariant}}).metadata.artworkVariant).toBeNull();
  });
  it.each(requestedStatuses)('accepts the requested timed status: %s',title=>{
    expect(validateEntry({kind:'status',title,startAt:'2026-09-15T18:00:00Z',endAt:'2026-09-15T19:00:00Z'})).toMatchObject({kind:'status',title});
  });
  it('is opt-in and does not accept truthy strings', () => {
    expect(familyEnabled('{}')).toBe(false);
    expect(familyEnabled({ familyCommandCenterEnabled: 'false' })).toBe(false);
    expect(familyEnabled('{"familyCommandCenterEnabled":true}')).toBe(true);
  });
  it('rejects invalid intervals, point values, statuses and executable image URLs', () => {
    for (const body of [
      {kind:'event',title:'Game'},
      {kind:'event',title:'Game',startAt:'2026-09-15T20:00:00Z',endAt:'2026-09-15T19:00:00Z'},
      {kind:'status',title:'Whatever',startAt:'2026-09-15T20:00:00Z',endAt:'2026-09-15T21:00:00Z'},
      {kind:'chore',title:'Chore',metadata:{points:-5}},
      {kind:'reward',title:'Reward',metadata:{points:0}}
    ]) expect(()=>validateEntry(body)).toThrow();
    expect(()=>safePhoto('javascript:alert(1)')).toThrow();
    expect(()=>safePhoto('data:image/svg+xml;base64,AAA=')).toThrow();
  });
  it('uses the household date for daily chores near UTC midnight and DST', () => {
    const e = { metadata:{recurrence:'daily'} };
    expect(occurrenceKey(e,'America/Denver',new Date('2026-09-16T02:00:00Z'))).toBe('2026-09-15');
    expect(occurrenceKey(e,'America/Denver',new Date('2026-11-01T08:30:00Z'))).toBe('2026-11-01');
  });
  it('weekly chores stay on the same occurrence through Sunday, then reset Monday', () => {
    const e = { metadata:{recurrence:'weekly'} };
    expect(occurrenceKey(e,'America/Denver',new Date('2026-09-20T19:00:00Z'))).toBe('2026-09-14');
    expect(occurrenceKey(e,'America/Denver',new Date('2026-09-21T19:00:00Z'))).toBe('2026-09-21');
  });
  it('rotates daily and weekly assignees predictably', () => {
    const e={created_at:'2026-09-14T18:00:00Z',metadata:{rotation:[1,2,3],recurrence:'daily'}};
    expect(assignedMember(e,'America/Denver',new Date('2026-09-15T18:00:00Z'))).toBe(2);
    e.metadata.recurrence='weekly';
    expect(assignedMember(e,'America/Denver',new Date('2026-09-21T18:00:00Z'))).toBe(2);
  });
  it('keeps weekly rotation aligned with the completion week even when created midweek',()=>{
    const e={created_at:'2026-09-16T18:00:00Z',metadata:{rotation:[1,2],recurrence:'weekly'}};
    expect(assignedMember(e,'America/Denver',new Date('2026-09-21T18:00:00Z'))).toBe(2);
    expect(assignedMember(e,'America/Denver',new Date('2026-09-23T18:00:00Z'))).toBe(2);
    e.metadata.recurrence='none';
    expect(assignedMember(e,'America/Denver',new Date('2026-09-23T18:00:00Z'))).toBe(1);
  });
});

it('preserves automatic title matching while allowing explicit event themes',()=>{
  const base={kind:'event',title:'Going to zoo',startAt:'2026-09-24T12:00:00Z',endAt:'2026-09-24T13:00:00Z'};
  expect(validateEntry({...base,metadata:{eventType:'zoo',autoTheme:true}}).metadata.autoTheme).toBe(true);
  expect(validateEntry({...base,metadata:{eventType:'camping',autoTheme:false}}).metadata.autoTheme).toBe(false);
  expect(validateEntry(base).metadata.autoTheme).toBe(true);
});
