import { describe,it,expect } from 'vitest';
import { businessCardLayout } from '../businessCardLayouts';
import { rectangleCardSvg,rectangleCardBackSvg } from '../businessCardRectangle';
import { cardPrintPositions,cardSheetPlan,printableCardsHtml,normalizePrintSettings,printSettingsDefaults } from '../businessCardPrint';
import { organizationCardDefaults,resolveCard } from '../businessCards';
const person={name:'Morgan Taylor',credentials:'MA, NCC, LPC',title:'Director of Strategy and Clinical Operations',email:'morgan@ITSCO.health',phone:'719-555-0100',extension:'700',address:'437 Windchime Place\nColorado Springs, CO 80919-1234'};
describe('Avery 8870 rectangle cards',()=>{
 it('uses the official 2-column 5-row Letter layout without gaps or bleed',()=>{
  expect(businessCardLayout('8870')).toMatchObject({cardWidth:3.5,cardHeight:2,count:10,left:.75,top:.5});
  const positions=cardPrintPositions({format:'8870'});expect(positions).toHaveLength(10);
  expect(positions[0]).toEqual({x:.75,y:.5});expect(positions[1]).toEqual({x:4.25,y:.5});expect(positions[9]).toEqual({x:4.25,y:8.5});
  expect(printSettingsDefaults({slug:'itsco'},'8870')).toMatchObject({bleed:0,bottomBleed:0,topRowOffsetY:0});
 });
 it('reflects duplex positions and exports ten cards per page, pairing each employee front/back',()=>{
  const settings={format:'8870',side:'both',offsetX:.02,offsetY:.03,backOffsetX:.01,backOffsetY:-.01};
  const front=cardPrintPositions(settings),back=cardPrintPositions(settings,true);
  front.forEach((p,i)=>{expect(back[i].x).toBeCloseTo(8.5-p.x-3.5+.01);expect(back[i].y).toBeCloseTo(p.y-.01);});
  const cards=[{...person,website:'agency.example'},{...person,name:'Other Employee',website:'agency.example'}];
  expect(cardSheetPlan(cards,settings).map(s=>[s.name,s.face,s.positions.length])).toEqual([['Morgan Taylor','front',10],['Morgan Taylor','back',10],['Other Employee','front',10],['Other Employee','back',10]]);
  const html=printableCardsHtml(cards,settings);expect(html).toContain('width:3.5in;height:2in');expect(html).toContain('Avery 8870');
  expect(new DOMParser().parseFromString(html,'text/html').querySelectorAll('.card')).toHaveLength(40);
 });
 it.each(['itsco','mh4kidz','nlu','plottwistco','tisi','kimi','new-agency'])('retains %s branding and staff data with fitted one-line names/emails',slug=>{
  const defaults=organizationCardDefaults({slug,name:slug,website_url:'agency.example'}),card=resolveCard(person,defaults);
  const doc=new DOMParser().parseFromString(rectangleCardSvg(card),'image/svg+xml');
  expect(doc.querySelector('svg').getAttribute('viewBox')).toBe('0 0 1050 600');
  expect(doc.querySelector('[data-card-panel="name-color"]').getAttribute('fill')).toBe(defaults.primary);
  expect(doc.querySelectorAll('[data-card-field="name"]')).toHaveLength(1);expect(doc.querySelectorAll('[data-card-field="email"]')).toHaveLength(1);
  expect(doc.querySelector('[data-card-field="credentials"]').getAttribute('font-weight')).toBe('700');
  expect(doc.documentElement.textContent).not.toContain('80919-1234');
  expect(rectangleCardBackSvg(card)).toContain('data-qr-url="https://agency.example/"');
 });
 it('adds the work number only with its actual calling/texting capabilities',()=>{
  expect(rectangleCardSvg({...person,workLine:{number:'+17195550101',canCall:true,canText:false}})).toContain('719-555-0101 Call</text>');
  expect(rectangleCardSvg({...person,workLine:{number:'+17195550101',canCall:false,canText:false}})).not.toContain('719-555-0101');
 });
 it('keeps the rectangle back QR on the agency destination, next to a separate logo',()=>{
  const card=resolveCard({...person,website:'personal.example'},{...organizationCardDefaults({website_url:'agency.example'}),logo:'data:image/png;base64,AAAA'});
  const svg=rectangleCardBackSvg(card);expect(svg).toContain('data-card-panel="agency-logo"');expect(svg).toContain('data-qr-url="https://agency.example/"');expect(svg).not.toContain('personal.example');
 });
 it('rejects overlapping bleed/row adjustments and unknown formats; square calibration stays intact',()=>{
  for(const settings of [{bleed:.01},{bottomBleed:.01},{topRowOffsetY:.01}])expect(()=>normalizePrintSettings({format:'8870',...settings})).toThrow();
  expect(()=>businessCardLayout('999')).toThrow();expect(cardPrintPositions(printSettingsDefaults({slug:'itsco'}))[0].y).toBe(.9375);
 });
});
