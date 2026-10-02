import { describe, it, expect } from 'vitest';
import { dashboardAccountSection, dashboardTabQuery, mergeDashboardSearchTargets } from '../dashboardSearchNavigation.js';
import { accountSearchTargets, fieldSearchTargets, searchProfileContent, collectRenderedSearchTargets } from '../profileContentSearch.js';

describe('dashboard search and account navigation', () => {
  it.each(['my_schedule', 'overview', 'submit', 'clients', 'training'])('an explicit %s destination wins over stale account parameters', tab => {
    const query = { tab, my: 'preferences', section: 'prefs-communication', profileField: '45', profileCategory: 'care', agencyId: '1' };
    expect(dashboardAccountSection(query)).toBeUndefined();
    expect(dashboardTabQuery(query, tab)).toEqual({tab, agencyId: '1'});
    expect(query.my).toBe('preferences');
  });
  it('keeps intentional account and legacy account-only deep links', () => {
    expect(dashboardAccountSection({tab:'my',my:'preferences'})).toBe('preferences');
    expect(dashboardAccountSection({my:'account'})).toBe('account');
    expect(dashboardTabQuery({my:'account',section:'my-business-cards'},'my')).toEqual({tab:'my',my:'account',section:'my-business-cards'});
  });
  it('finds business cards and CBT before My Account has mounted', () => {
    const targets = mergeDashboardSearchTargets([
      ...accountSearchTargets({canPrintCards:true}),
      ...fieldSearchTargets([{id:45,field_key:'modality',field_label:'Treatment modalities',category_key:'clinical',options:['CBT']}],{mode:'self'})
    ], []);
    expect(searchProfileContent('business car',targets)[0]).toMatchObject({tabId:'my',mySection:'account',sectionId:'my-business-cards'});
    expect(searchProfileContent('CBT',targets)[0]).toMatchObject({tabId:'my',mySection:'account',fieldId:45});
  });
  it('keeps shortcut aliases and authorized external destinations without introducing hidden account pages', () => {
    const entry={id:'approvals',kind:'path',path:'/admin/office-approvals',label:'Office approvals',keywords:['approve rooms']};
    const targets=mergeDashboardSearchTargets([{tabId:'my',mySection:'payroll',label:'My Payroll',kind:'Page'}],[entry,
      {kind:'dashboard',tab:'my',my:'payroll',label:'Pay',keywords:['paycheck']},
      {kind:'dashboard',tab:'my',my:'kudos',label:'Kudos'}]);
    expect(searchProfileContent('paycheck',targets)[0].mySection).toBe('payroll');
    expect(searchProfileContent('approve rooms',targets)[0].quickNavEntry).toBe(entry);
    expect(searchProfileContent('kudos',targets)).toEqual([]);
  });
  it('returns one business-card destination after the page mounts and ranks it ahead of business-hours matches', () => {
    const root=document.createElement('div');
    root.innerHTML='<div data-profile-my-section="account"><div id="my-business-cards" class="info-section"><div><h2>My business cards</h2></div><p>Print Avery square cards</p></div></div><div data-profile-my-section="preferences"><label>Allow support staff to step in after 24 business hours</label></div>';
    const hits=searchProfileContent('business',[...accountSearchTargets({canPrintCards:true}),...collectRenderedSearchTargets(root,{tabId:'my',mySection:'account'})]);
    expect(hits.filter(h=>h.label==='My business cards')).toHaveLength(1);
    expect(hits[0].sectionId).toBe('my-business-cards');
  });
});
