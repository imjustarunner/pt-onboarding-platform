import { describe, expect, it } from 'vitest';
import { AVERY_35702, cardPositions, employeeCardDefaults, groupCardDefaults, assignedCardOffices, organizationCardDefaults, isCardEmployee, resolveCard, readCardDraft, cardSvg, safeLogo } from '../businessCards';

import { printableCardsHtml } from '../businessCardPrint';

describe('employee business cards', () => {
  it('cleans ITSCO department prefixes only for card display and preserves the agency name', () => {
    for (const name of ['ITSCO - People Operations','ITSCO People Operations','itsco — People Operations']) {
      const group={id:'group:1',name,email:'po@itsco.health'};
      expect(groupCardDefaults(group,[],{slug:'itsco'}).name).toBe('People Operations');
      expect(group.name).toBe(name);
    }
    expect(groupCardDefaults({id:'organization',kind:'organization',name:'ITSCO'},[],{slug:'itsco'}).name).toBe('ITSCO');
    expect(groupCardDefaults({id:'group:1',name:'ITSCO Support'},[],{slug:'another'}).name).toBe('ITSCO Support');
  });
  it('prints every distinct office on shared cards and fits enlarged headings and addresses inside their panels', () => {
    const offices=[{id:'1',address:'123 North St\nColorado Springs, CO 80919'},{id:'2',address:'456 South St\nColorado Springs, CO 80906'}];
    for (const [kind,name] of [['organization','ITSCO'],['group','People Operations'],['department','Technology Support']]) {
      const card=resolveCard(groupCardDefaults({id:'group:1',kind,name},offices),{phone:'719-657-7444',website:'ITSCO.health'});
      const doc=new DOMParser().parseFromString(cardSvg(card),'image/svg+xml');
      const heading=doc.querySelector('[data-card-field="display-name"]');
      expect(Number(heading.querySelector('text').getAttribute('font-size'))).toBeGreaterThan(44);
      expect(heading.textContent.replace(/\s/g,'')).toBe(name.replace(/\s/g,''));
      const address=doc.querySelector('[data-card-panel="address"]');
      expect(address.textContent).toContain('OFFICE LOCATIONS');expect(address.textContent).toContain('123 North St');expect(address.textContent).toContain('456 South St');
      const offset=Number(address.getAttribute('transform').match(/translate\(0 ([^)]+)\)/)[1]);
      for(const el of address.querySelectorAll('text'))expect(Number(el.getAttribute('y'))+offset).toBeLessThanOrEqual(715);
    }
  });
  it('does not print a disconnected extension when the agency has no office number', () => {
    const svg = cardSvg({ name: 'Michael Mendez', phone: '', extension: '701' });
    expect(svg).not.toContain('data-card-contact="office-phone"');
    expect(svg).not.toContain('ext. 701');
  });
  it('uses the agency-specific position while preserving the global title as a fallback', () => {
    expect(employeeCardDefaults({ title: 'Credentialing Specialist', agency_position: 'Facilitator' }).title).toBe('Facilitator');
    expect(employeeCardDefaults({ title: 'Director of Operations and Administration', agency_position: '' }).title).toBe('Director of Operations and Administration');
  });
  it('places nine 180-point square cards within a Letter page, including alignment offsets', () => {
    const positions = cardPositions();
    expect(positions).toHaveLength(9);
    expect(positions[0]).toEqual({ x: 0.25, y: 0.875 });
    expect(positions[8]).toEqual({ x: 5.75, y: 7.625 });
    for (const p of cardPositions(0.125, -0.125)) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + AVERY_35702.card).toBeLessThanOrEqual(8.5);
      expect(p.y + AVERY_35702.card).toBeLessThanOrEqual(11);
    }
    expect(() => cardPositions(NaN, 0)).toThrow();
    expect(() => cardPositions(0, 1)).toThrow();
  });

  it('extends color beyond trim without scaling or moving the card content', () => {
    const card = { name: 'Rachel Finch', email: 'rachel@itsco.health', address: '437 Windchime Place' };
    const parse = value => new DOMParser().parseFromString(value, 'image/svg+xml');
    const trim = parse(cardSvg(card));
    const bleed = parse(cardSvg(card, {}, AVERY_35702.bleed));
    expect(bleed.documentElement.getAttribute('viewBox')).toBe('-18.75 -18.75 787.5 787.5');
    expect([...bleed.querySelectorAll('text')].map(t => t.outerHTML)).toEqual([...trim.querySelectorAll('text')].map(t => t.outerHTML));
    const panel = bleed.querySelector('[data-card-panel="address-color"]');
    expect(Number(panel.getAttribute('y'))).toBe(375);
    expect(Number(panel.getAttribute('x')) + Number(panel.getAttribute('width'))).toBe(768.75);
    expect(Number(panel.getAttribute('y')) + Number(panel.getAttribute('height'))).toBe(768.75);
    for (const p of cardPositions(0.125, -0.125)) {
      expect(p.x - AVERY_35702.bleed).toBeGreaterThanOrEqual(0);
      expect(p.y - AVERY_35702.bleed).toBeGreaterThanOrEqual(0);
      expect(p.x + AVERY_35702.card + AVERY_35702.bleed).toBeLessThanOrEqual(8.5);
      expect(p.y + AVERY_35702.card + AVERY_35702.bleed).toBeLessThanOrEqual(11);
    }
    expect(AVERY_35702.card + 2 * AVERY_35702.bleed).toBeLessThan(AVERY_35702.pitchX);
  });

  it('keeps personal contact information off cards and applies office defaults', () => {
    const organization = organizationCardDefaults({ phone_number: '555-0100', phone_extension: '10', website_url: 'example.org', street_address: '123 Main St', city: 'Denver', state: 'CO', postal_code: '80000' });
    const person = employeeCardDefaults({ id: 1, first_name: 'Sam', last_name: 'Jones', email: 'private@example.org', personal_phone: '555-9999', phone_number: '555-9998', home_street_address: 'Private home' });
    expect(person.email).toBe(''); expect(person.phone).toBe(''); expect(person.address).toBe('');
    expect(resolveCard(person, organization)).toMatchObject({ phone: '555-0100', extension: '10', address: '' });
    expect(resolveCard({ ...person, officeId: '__organization' }, organization).address).toBe('123 Main St\nDenver, CO 80000');
    expect(resolveCard({ ...person, phone: '555-0101' }, organization).extension).toBe('');
    expect(resolveCard({ ...person, extension: '700' }, organization).extension).toBe('700');
  });

  it('uses each employee’s own profile and primary active office within the organization', () => {
    const offices = assignedCardOffices([
      { id: 10, isActive: true, isPrimary: true }, { id: 11, isActive: true },
      { id: 12, isActive: false }, { id: 99, isActive: true, isPrimary: true }
    ], [
      { id: 10, agencyIds: [12], street_address: '10 Primary St', city: 'Denver', state: 'CO', postal_code: '80001' },
      { id: 11, agencyIds: [12], street_address: '11 Alternate St' },
      { id: 12, agencyIds: [12], street_address: '12 Inactive St' },
      { id: 99, agencyIds: [24], street_address: '99 Other Organization St' }
    ], 12);
    expect(offices.map(o => o.id)).toEqual(['10', '11']);
    const person = employeeCardDefaults({ id: 7, first_name: 'Alex', last_name: 'Jones', title: 'Clinical Director', credential: 'PhD', work_phone: '719-555-0123', work_phone_extension: '402', work_email: 'alex@example.org' }, offices);
    const organization = organizationCardDefaults({ street_address: 'Organization HQ', phone_number: '719-555-0100' });
    expect(resolveCard(person, organization)).toMatchObject({ name: 'Alex Jones', title: 'Clinical Director', credentials: 'PhD', phone: '719-555-0100', extension: '402', email: 'alex@example.org', address: '10 Primary St\nDenver, CO 80001' });
    expect(resolveCard({ ...person, officeId: '11' }, organization).address).toBe('11 Alternate St');
    expect(employeeCardDefaults({}, offices.map(o => ({ ...o, primary: false }))).officeId).toBe('');
  });

  it('limits selection to active employees of the exact organization', () => {
    const base = { agency_ids: '12,24', role: 'provider', status: 'ACTIVE_EMPLOYEE', is_active: 1 };
    expect(isCardEmployee(base, 12)).toBe(true);
    expect(isCardEmployee(base, 2)).toBe(false);
    expect(isCardEmployee({ ...base, role: 'guardian' }, 12)).toBe(false);
    expect(isCardEmployee({ ...base, status: 'TERMINATED' }, 12)).toBe(false);
    expect(isCardEmployee({ ...base, is_active: '0' }, 12)).toBe(false);
  });

  it('uses resolved organization contacts when optional profile fields are blank and normalizes saved extensions', () => {
    const contact = { email: 'rachel@itsco.health', phone: { display: '719-657-7444' }, website: { display: 'ITSCO.health' } };
    const organization = organizationCardDefaults({ name: 'ITSCO', phone_number: null, website_url: null }, contact);
    const person = employeeCardDefaults({ id: 507, first_name: 'Rachel', last_name: 'Finch', title: 'Director of Strategy and Clinical Operations', credential: 'MA, NCC, LPC', email: 'login@example.org', work_email: null, work_phone: '', work_phone_extension: 'Ext. 700' }, [], contact);
    const card = resolveCard(person, organization);
    expect(card).toMatchObject({ title: 'Director of Strategy and Clinical Operations', credentials: 'MA, NCC, LPC', email: 'rachel@itsco.health', phone: '719-657-7444', extension: '700', website: 'ITSCO.health' });
    expect(cardSvg(card)).toContain('719-657-7444 ext. 700');
    expect(cardSvg(card)).not.toContain('ext. Ext.');
    expect(organizationCardDefaults({ phone_number: '303-555-0100', website_url: 'example.org' }, contact)).toMatchObject({ phone: '303-555-0100', website: 'example.org' });
    expect(resolveCard({ ...person, phone: '719-555-0101' }, organization).phone).toBe('719-555-0101');
  });

  it('creates one page per person without mixing names on sheets', () => {
    const doc = new DOMParser().parseFromString(printableCardsHtml([{ name: 'Rachel Finch' }, { name: 'Sam Jones' }]), 'text/html');
    const sheets = doc.querySelectorAll('.sheet'); expect(sheets).toHaveLength(2);
    for (const [i, sheet] of [...sheets].entries()) {
      expect(sheet.querySelectorAll('.card')).toHaveLength(9);
      expect([...sheet.querySelectorAll('img')].every(img => img.alt === ['Rachel Finch', 'Sam Jones'][i])).toBe(true);
    }
  });

  it('escapes user-provided text and rejects executable logo URLs', () => {
    const svg = cardSvg({ name: '<script>alert(1)</script>', logo: 'javascript:alert(1)', primary: 'red" onload="bad' });
    expect(svg).not.toContain('<script>'); expect(svg).not.toContain('javascript:'); expect(svg).not.toContain('onload=');
    expect(safeLogo('data:image/svg+xml,<svg onload="bad"/>')).toBe('');
    expect(safeLogo('//untrusted.example/image')).toBe('');
  });

  it('loads drafts only for their organization and whitelists editable fields', () => {
    const raw = JSON.stringify({ version: 1, organizationId: 12, organization: { primary: 'invalid', logo: 'javascript:bad' }, people: [{ id: 1, name: 'Sam', selected: true, personal_phone: 'secret' }] });
    expect(() => readCardDraft(raw, 24)).toThrow();
    const loaded = readCardDraft(raw, 12);
    expect(loaded.organization.primary).toBe('#a1dce1'); expect(loaded.organization.logo).toBe('');
    expect(loaded.people[0]).not.toHaveProperty('personal_phone'); expect(loaded.people[0].selected).toBe(true);
  });
});

describe('two-number card layout', () => {
 const parse = value => new DOMParser().parseFromString(value, 'image/svg+xml');
 it.each([[true,true,'Call / Text'],[true,false,'Text'],[false,true,'Call']])('prints enabled contact labels and fits all contact rows below the identity', (canText,canCall,label) => {
   const card = {name:'Alexandra Montgomery-Santos',email:'alexandra.montgomery-santos@ITSCO.health',phone:'719-657-7444',extension:'700',website:'ITSCO.health',workLine:{number:'+17195550123',canText,canCall}};
   const doc=parse(cardSvg(card));
   expect(doc.querySelector('[data-card-panel="identity"]').textContent).not.toContain('719-657');
   expect(doc.querySelector('[data-card-contact="office-phone"]').textContent).toBe('719-657-7444 ext. 700');
   expect(doc.querySelector('[data-card-contact="work-phone"]').textContent).toBe('719-555-0123 '+label);
   for(const field of ['office-phone','work-phone','email','website']) {
     const nodes=doc.querySelectorAll(`text[data-card-field="${field}"]`); expect(nodes).toHaveLength(1);
     expect(+nodes[0].getAttribute('y')).toBeGreaterThan(375); expect(+nodes[0].getAttribute('y')).toBeLessThan(710);
   }
   expect(doc.querySelectorAll('text[data-card-field="name"]')).toHaveLength(1);
 });
 it('omits unavailable work lines without leaving a blank contact row',()=>{
   const card={phone:'719-657-7444',email:'rachel@itsco.health',workLine:{number:'555-0100',canText:false,canCall:false}};
   const doc=parse(cardSvg(card));expect(doc.querySelector('[data-card-contact="work-phone"]')).toBeNull();
   expect(doc.querySelector('[data-card-field="email"]').textContent).toBe('rachel@ITSCO.health');
   expect(+doc.querySelector('[data-card-field="email"]').getAttribute('y')).toBe(528);
 });
 it('takes work-line capabilities from records, never editable drafts',()=>{
   const workLine={number:'+17195550123',canText:true,canCall:false};
   const person=employeeCardDefaults({id:7,work_phone:'private'},[],{workLine});
   expect(person.phone).toBe('');expect(person.workLine).toEqual(workLine);
   const loaded=readCardDraft(JSON.stringify({version:1,organizationId:2,people:[{id:7,workLine:{number:'forged',canCall:true}}]}),2);
   expect(loaded.people[0]).not.toHaveProperty('workLine');
 });
});

describe('agency card artwork',()=>{
 it('frames the supplied NLU logo separately from the faded arrow icon',()=>{
  const card={...organizationCardDefaults({slug:'nlu'}),name:'Rachel Finch'};
  const doc=new DOMParser().parseFromString(cardSvg(card),'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  expect(doc.querySelector('[data-card-logo="primary"]').getAttribute('viewBox')).toBe('25 5 700 300');
  expect(doc.querySelector('[data-card-watermark="logo"]').getAttribute('href')).toBe('/assets/nlu/icon.png');
  const draft=readCardDraft(JSON.stringify({version:1,organizationId:6,organization:card,people:[]}),6);
  expect(draft.organization.logoCrop).toBe(card.logoCrop);expect(draft.organization.watermarkLogo).toBe(card.watermarkLogo);
 });
});
it('puts Candidate on a separate card line and suppresses ambiguous titles for Unlicensed Masters',()=>{
 const card=employeeCardDefaults({first_name:'A',credential:'LPCC',title:'Counselor Candidate',displayRole:{label:'Counselor',candidate:true}});
 const doc=new DOMParser().parseFromString(cardSvg(card),'image/svg+xml');
 expect([...doc.querySelectorAll('tspan,text')].some(e=>e.textContent==='Candidate')).toBe(true);
 const unlicensed=cardSvg({...card,title:'Counselor',displayLabel:'Unlicensed Masters',candidate:false});expect(unlicensed).toContain('Unlicensed Masters');expect(unlicensed).not.toContain('>Counselor<');expect(unlicensed).not.toContain('>Candidate<');
});
