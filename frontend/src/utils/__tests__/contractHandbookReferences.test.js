import { describe, expect, it } from 'vitest';
import { contractHandbookSrcdoc, handbookSectionFromHref, referenceFromContractClick, referenceFromContractMessage } from '../contractHandbookReferences.js';
import { documentBrandStyle, resolveDocumentBrand } from '../documentBranding.js';
describe('isolated contract handbook links', () => {
  const payload={type:'contract-handbook-reference',agencyId:6,sectionSlug:'testing-services',expectedVersionId:42,sectionTitle:'Testing'};
  it('requires the actual contract iframe source and matching company',()=>{
    const source={},frame={contentWindow:source};expect(referenceFromContractMessage({origin:'null',source,data:payload},frame,{expectedAgencyId:6})).toMatchObject({agencyId:6,sectionSlug:'testing-services',expectedVersionId:42});
    expect(referenceFromContractMessage({origin:'null',source:{},data:payload},frame,{expectedAgencyId:6})).toBeNull();expect(referenceFromContractMessage({origin:'null',source,data:payload},frame,{expectedAgencyId:2})).toBeNull();expect(referenceFromContractMessage({origin:'null',source,data:{...payload,sectionSlug:'../other'}},frame)).toBeNull();
    expect(referenceFromContractMessage({origin:'null',source,data:{...payload,agencyId:[6]}},frame)).toBeNull();expect(referenceFromContractMessage({origin:'null',source,data:{...payload,sectionSlug:['testing-services']}},frame)).toBeNull();
  });
  it.each(['https://evil.example','https://app.nextleveluplcc.com','',undefined])('rejects a non-opaque origin even with the same frame source: %s',origin=>{
    const source={};expect(referenceFromContractMessage({origin,source,data:payload},{contentWindow:source},{expectedAgencyId:6})).toBeNull();
  });
  it('prevents only a valid in-document reference and does not navigate the signer away',()=>{
    const root=document.createElement('div');root.innerHTML='<a href="/nlu/workplace-handbook" data-handbook-reference="true" data-handbook-agency-id="6" data-handbook-section="testing-services" data-handbook-version-id="42">Testing</a>';const event={target:root.firstChild,preventDefault:()=>{event.prevented=true}};expect(referenceFromContractClick(event,{root,expectedAgencyId:6})).toMatchObject({sectionSlug:'testing-services'});expect(event.prevented).toBe(true);
  });
  it('keeps contract styles and valid reference attributes but removes prior executable content',()=>{
    const html=contractHandbookSrcdoc('<html><head><style>p{color:red}</style><script>alert("unsafe")</script></head><body><a data-handbook-reference="true" data-handbook-section="testing-services" onclick="bad()">Testing</a></body></html>');expect(html).toContain('p{color:red}');expect(html).toContain('data-handbook-reference="true"');expect(html).not.toContain('unsafe');expect(html).not.toContain('onclick');expect(html).toContain("type:'contract-handbook-reference'");
  });
});
describe('same-company handbook citations',()=>{
  const agency={id:6,slug:'nextlevelup'};
  const options={agency,origin:'https://portal.example'};
  it.each([
    '#handbook-testing-services',
    'https://app.nextleveluplcc.com/nlu/workplace-handbook#handbook-testing-services',
    'https://app.nextleveluplcc.com/workplace-handbook?agencyId=6&versionId=999#handbook-testing-services',
    '/nextlevelup/workplace-handbook#handbook-testing-services',
    '/workplace-handbook?agencyId=6#handbook-testing-services'
  ])('recognizes a verified company citation: %s',href=>expect(handbookSectionFromHref(href,options)).toBe('testing-services'));
  it.each([
    'https://evil.example/nlu/workplace-handbook#handbook-testing-services',
    'https://app.nextleveluplcc.com.evil.example/nlu/workplace-handbook#handbook-testing-services',
    'https://app.nextleveluplcc.com/itsco/workplace-handbook#handbook-testing-services',
    'https://app.itsco.health/itsco/workplace-handbook#handbook-testing-services',
    'https://app.nextleveluplcc.com/nlu/workplace-handbook?agencyId=2#handbook-testing-services',
    'https://app.nextleveluplcc.com/nlu/workplace-handbook?agencyId=6&agencyId=2#handbook-testing-services',
    'https://app.nextleveluplcc.com@evil.example/nlu/workplace-handbook#handbook-testing-services',
    'https://app.nextleveluplcc.com:8443/nlu/workplace-handbook#handbook-testing-services',
    '/itsco/workplace-handbook#handbook-testing-services',
    '/workplace-handbook#handbook-testing-services',
    'https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html',
    'javascript:alert(1)',
    '#handbook-../private'
  ])('leaves untrusted or other-company URLs outside the pinned handbook: %s',href=>expect(handbookSectionFromHref(href,options)).toBeNull());
});
describe('document palettes',()=>{
  it('uses actual saved colors and readable dark text for NLU and Inner Strength',()=>{
    const nlu=resolveDocumentBrand({presentation:{agencyBrand:{primary:'#6FCFBE',secondary:'#1F2A44',accent:'#9FB7A5'}}});expect(nlu.primary).toBe('#6FCFBE');expect(nlu.ink).toBe('#1F2A44');
    const isi=documentBrandStyle({presentation:{agencyBrand:{primary:'#0F172A',secondary:'#1E40AF',accent:'#F97316'}}});expect(isi['--doc-primary']).toBe('#0F172A');expect(isi['--doc-accent']).toBe('#F97316');expect(isi['--doc-tint']).not.toBe(documentBrandStyle({presentation:{theme:'itsco-foundations'}})['--doc-tint']);
  });
  it('uses a matching agency palette over stale document colors and rejects CSS injection',()=>{
    expect(resolveDocumentBrand({presentation:{primaryColor:'#145A3D'}},{agency:{color_palette:{primary:'#0F172A',secondary:'#1E40AF',accent:'#F97316'}}}).primary).toBe('#0F172A');expect(documentBrandStyle({presentation:{primaryColor:'url(evil)'}})['--doc-primary']).toBe('#243B53');
  });
});
