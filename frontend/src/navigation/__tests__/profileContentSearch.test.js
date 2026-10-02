import { describe, it, expect } from 'vitest';
import { adminSearchTargets, accountSearchTargets, fieldSearchTargets, searchProfileContent, collectRenderedSearchTargets, recordSearchTargets } from '../profileContentSearch.js';
const tabs = [{id:'account',label:'Account'}, {id:'provider_info',label:'Clinical Information'}, {id:'benefits',label:'Benefits'}];
const fields = [{id:45,field_key:'modality',field_label:'Treatment modalities',category_key:'provider_clinical',value:'Narrative therapy',options:['Cognitive Behavioral Therapy (CBT)','EMDR']}];
describe('profile content search destinations', () => {
  it('finds business cards before their page has been opened on both surfaces', () => {
    expect(searchProfileContent('bus',adminSearchTargets(tabs,{canPrintCards:true}))[0]).toMatchObject({tabId:'account',sectionId:'profile-business-cards'});
    expect(searchProfileContent('Avery 35702',accountSearchTargets({canPrintCards:true}))[0]).toMatchObject({tabId:'my',mySection:'account',sectionId:'my-business-cards'});
  });
  it('routes choice text to the actual clinical field and distinguishes choices from answers', () => {
    const hits=searchProfileContent('cbt',adminSearchTargets(tabs,{fields}));
    expect(hits[0]).toMatchObject({fieldId:45,tabId:'provider_info',clinicalSubTab:'therapeutic_approaches',sectionId:'provider-profile-field-45',matchKind:'Content match'});
    expect(hits[0].snippet).toContain('Choices:');
    expect(hits.some(h=>h.label==='CBT')).toBe(false);
  });
  it('searches arbitrary saved answers and actual category names in My Account',()=>{
    const targets=fieldSearchTargets(fields,{mode:'self',categories:[{category_key:'provider_clinical',category_label:'Care preferences'}]});
    expect(searchProfileContent('Narrative',targets)[0]).toMatchObject({tabId:'my',mySection:'account',fieldId:45,categoryKey:'provider_clinical'});
    expect(searchProfileContent('Care preferences',targets).some(h=>h.kind==='Category')).toBe(true);
  });
  it('includes new available tabs automatically and excludes unavailable destinations',()=>{
    const targets=adminSearchTargets([{id:'future_tab',label:'New department page'}],{fields});
    expect(searchProfileContent('department',targets)[0].tabId).toBe('future_tab');
    expect(targets.some(t=>t.fieldId||t.id==='business-cards')).toBe(false);
    expect(accountSearchTargets({isClub:true}).some(t=>t.mySection==='payroll'||t.id==='my-business-cards')).toBe(false);
  });
  it('does not index hidden self NPI values or secrets',()=>{
    const f=[...fields,{id:46,field_key:'npi_id',field_label:'NPI ID',value:'hidden-npi'}, {id:47,field_key:'password',field_label:'Password',value:'hidden-secret'}];
    expect(searchProfileContent('hidden',fieldSearchTargets(f,{mode:'self',hideNpiId:true}))).toEqual([]);
    expect(searchProfileContent('supersecret',recordSearchTargets({first_name:'José',password:'supersecret'}))).toEqual([]);
    expect(searchProfileContent('jose',recordSearchTargets({first_name:'José'}))[0].sectionId).toBe('account-info');
  });
  it('indexes rendered content with its actual hidden panel destination, ignoring the search box and secrets',()=>{
    const root=document.createElement('div');
    root.innerHTML='<div data-profile-search><h3>Search results</h3><section id="fake"><h3>Fake destination</h3></section></div><div data-profile-my-section="benefits" style="display:none"><section id="dental"><h3>Dental coverage</h3>Acme Smile Plan</section></div><section id="bio"><h3>About me</h3><textarea>Avid gardener</textarea></section><section id="secret"><h3>Direct login link</h3><input value="private-value"></section>';
    const targets=collectRenderedSearchTargets(root,{tabId:'my',mySection:'account'});
    expect(searchProfileContent('Smile',targets)[0]).toMatchObject({mySection:'benefits',sectionId:'dental'});
    expect(searchProfileContent('gardener',targets)[0].sectionId).toBe('bio');
    expect(searchProfileContent('Fake destination',targets)).toEqual([]);
    expect(searchProfileContent('private-value',targets)).toEqual([]);
  });
  it('supports multiword matches and deduplicates identical destinations',()=>{
    const targets=accountSearchTargets({canPrintCards:true});
    expect(searchProfileContent('   ',targets)).toEqual([]);
    expect(searchProfileContent('print square',[...targets,...targets])).toHaveLength(1);
  });
});
