import { expect, it } from 'vitest';
import { emptyTransitionState, hydrateTransitionState, transitionTaskCatalog, transitionVideoCatalog } from '../../content/transitionWeek.js';
import { validateTransitionState } from '../transitionWeekPolicy.js';
it('shows shared work in all practices and keeps closure, Google and cohort scope accurate', () => {
  for (const id of [6,2,377]) {
    const catalog = transitionTaskCatalog(id);
    for (const category of ['Records','Families','Texting','Training videos','Acceptance','Billing']) expect(catalog.some(t => t.category === category)).toBe(true);
    expect(catalog.some(t => t.title.includes('NLU'))).toBe(false);
  }
  expect(transitionTaskCatalog(2).some(t => t.id === 'closure')).toBe(false);
  expect(transitionTaskCatalog(2).some(t => t.id === 'retain_access')).toBe(true);
  expect(transitionTaskCatalog(377).some(t => t.id === 'google_exit')).toBe(false);
  expect(transitionTaskCatalog(377).find(t => t.id === 'closure').title).toContain('Inner Strength');
  expect(transitionVideoCatalog(2).some(v => v.id === 'cohorts')).toBe(true);
});
it('hydrates new video/checklist rows without erasing existing evidence', () => {
  const state = hydrateTransitionState({ tasks: { archive: { status: 'passed', evidence: 'Original archive reference' } }, metrics: {}, ranking: null, cohorts: {} });
  expect(state.tasks.archive.evidence).toBe('Original archive reference');
  expect(state.videos.source_export.status).toBe('not_started');
  expect(state.tasks.cohort_ranking.status).toBe('unverified');
});
it('requires a creator before production starts and a next action for blocked videos', () => {
  const state = emptyTransitionState(); state.videos.login.status = 'recording';
  expect(() => validateTransitionState(state,emptyTransitionState(),6,99)).toThrow('creator');
  Object.assign(state.videos.login,{status:'blocked',owner:'Technology lead'});
  expect(() => validateTransitionState(state,emptyTransitionState(),6,99)).toThrow('next action');
});
it('requires independent review and a safe watch link before publication', () => {
  const state = emptyTransitionState(); Object.assign(state.videos.login,{status:'published',owner:'Creator',reviewer:'Creator',url:'https://example.test/video',evidence:'Reviewed'});
  expect(() => validateTransitionState(state,emptyTransitionState(),6,99)).toThrow('independent reviewer');
  state.videos.login.reviewer = 'Clinical reviewer'; state.videos.login.url='javascript:alert(1)';
  expect(() => validateTransitionState(state,emptyTransitionState(),6,99)).toThrow('HTTPS');
});
it('records completion from the real server actor and keeps the timestamp on unchanged saves', () => {
  const state = emptyTransitionState(); Object.assign(state.videos.login,{status:'published',owner:'Technology lead',reviewer:'Independent trainer',url:'/my-learning?guide=login',evidence:'Reviewed against the released workflow',completedAt:'2000-01-01',completedByUserId:1});
  const saved = validateTransitionState(state,emptyTransitionState(),6,99);
  expect(saved.videos.login.completedByUserId).toBe(99); expect(saved.videos.login.completedAt).not.toBe('2000-01-01');
  expect(validateTransitionState(saved,saved,6,123).videos.login.completedAt).toBe(saved.videos.login.completedAt);
});
it('keeps video readiness open until every applicable video is published', () => {
  const state = emptyTransitionState(); Object.assign(state.tasks.videos_ready,{status:'passed',owner:'Training lead',evidence:'Claimed ready'});
  expect(() => validateTransitionState(state,emptyTransitionState(),6,99)).toThrow('every required video');
});
it('does not permit checking off named ITSCO batches that have not been populated', () => {
  const state = emptyTransitionState();
  for (const id of ['rosters','cohort_ranking']) Object.assign(state.tasks[id],{status:'passed',owner:'Transition lead',evidence:'Source reviewed'});
  expect(() => validateTransitionState(state,emptyTransitionState(),2,99)).toThrow('named ITSCO groups');
});
