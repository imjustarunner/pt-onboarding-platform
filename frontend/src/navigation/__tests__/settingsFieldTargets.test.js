import { describe, it, expect, afterEach } from 'vitest';
import { buildSettingsSearchTargets, filterSettingsSearchTargets } from '../settingsSearchCatalog';
import { focusSettingsField } from '../settingsFieldTargets';
afterEach(()=>{document.body.innerHTML='';});
describe('field-level settings navigation',()=>{
  const targets=buildSettingsSearchTargets({catalogItems:[{id:'business-details',categoryId:'general'}]});
  it.each(['tax id','Tax-ID','EIN','FEIN','taxid','employer identification number'])('finds and prioritizes the actual tax field for %s', query=>{
    const hit=filterSettingsSearchTargets(query,targets)[0];
    expect(hit.field).toBe('tax-id');expect(hit.agencyTab).toBe('contact');expect(hit.itemId).toBe('business-details');
  });
  it('does not expose business fields when business settings are excluded',()=>{
    const restricted=buildSettingsSearchTargets({catalogItems:[],includeCompanyProfile:false});
    expect(filterSettingsSearchTargets('tax id',restricted)).toEqual([]);
  });
  it('searches field names only, never saved tax IDs',()=>{expect(filterSettingsSearchTargets('123456789',targets)).toEqual([]);});
  it('focuses only the requested editor and clears old highlights',()=>{
    document.body.innerHTML='<section id="other"><div data-setting-field="tax-id"><input></div></section><section id="current"><div data-setting-field="tax-id"><input id="tax"></div><div data-setting-field="timezone"><select id="zone"><option>Mountain</option></select></div></section>';
    const root=document.getElementById('current');
    expect(focusSettingsField(root,'tax-id')).toBe(true);expect(document.activeElement.id).toBe('tax');
    expect(focusSettingsField(root,'timezone')).toBe(true);expect(document.activeElement.id).toBe('zone');
    expect(root.querySelectorAll('.setting-search-highlight')).toHaveLength(1);
    expect(focusSettingsField(root,'[unsafe]')).toBe(false);
  });
});
