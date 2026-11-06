import { describe,it,expect,vi,beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
import { getClinicalServiceReference, listClinicalServiceReferences } from '../clinicalServiceReference.service.js';
import { ITSCO_DIRECT_BOOKABLE_CODES } from '../../config/tenantServiceSuiteCatalog.js';
import { getNoteAidToolById } from '../../config/noteAidTools.js';
import { DEFAULT_MEDICAL_SERVICE_CODES } from '../medicalBillingDefaults.service.js';
import { PAYROLL_SERVICE_CODE_DEFAULTS } from '../payrollServiceCodeDefaults.js';
import { assertServiceCodeAllowed, eligibleServiceCodesForTier } from '../../utils/clinicalServiceCodeEligibility.js';
import { buildMedicaid8MinuteBands, resolveSessionBilling } from '../serviceCodeUnits.service.js';
import { getServiceReference } from '../../controllers/clinicalServiceReference.controller.js';
import ClinicalEligibilityService from '../clinicalEligibility.service.js';
import AgencyMedicalServiceCode from '../../models/AgencyMedicalServiceCode.model.js';
import { applyNarrivaServiceHandbookAmendment } from '../../content/narrivaServiceHandbookAmendment.js';
import { H2011_HANDBOOK_SLUG } from '../../content/narrivaServiceHandbookAmendment.js';

const h2011 = DEFAULT_MEDICAL_SERVICE_CODES.find(code => code.serviceCode === 'H2011');
describe('sourced clinical service references',()=>{
 it('covers every offered clinical code plus screening, and marks missing manual entries honestly',()=>{
  expect(listClinicalServiceReferences()).toHaveLength(ITSCO_DIRECT_BOOKABLE_CODES.length+1);
  for(const code of ITSCO_DIRECT_BOOKABLE_CODES) expect(getClinicalServiceReference(code)?.code).toBe(code);
  for(const code of ['97535','99051','PRO-BONO SERVICE']) expect(getClinicalServiceReference(code)).toMatchObject({status:'not-in-supplied-manual',source:{pages:[]}});
 });
 it('uses only base H2011 p80 and does not merge ET or peer-specific qualifications',()=>{
  const info=getClinicalServiceReference(' h2011 ');
  expect(info.source).toMatchObject({edition:'2026-10',effectiveDate:'2026-10-01',pages:[80]});
  expect(info.providerQualifications).toMatch(/QBHA.*Bach Level/);
  expect(info.providerQualifications).not.toMatch(/Peer/);
  expect(info.manualText).not.toContain('First position modifier: ET');
  expect(info.crisisReview).toMatchObject({reviewAtMinutes:248,suggestedServiceCode:'S9485',automaticSubstitution:false});
  expect(getClinicalServiceReference('H2011 ET')).toBeNull();
 });
 it('keeps actual manual columns separate for representative intake, psychotherapy and H-code pages',()=>{
  const intake=getClinicalServiceReference('90791');expect(intake.source.pages).toEqual([10]);expect(intake.serviceDescription).toContain('integrated biopsychosocial assessment');expect(intake.documentation).toContain('does not include psychotherapeutic services');expect(intake.minDurationText).toBe('N/A');
  const therapy=getClinicalServiceReference('90837');expect(therapy.source.pages).toEqual([16]);expect(therapy.minUnitMinutes).toBe(53);expect(therapy.maxUnitMinutes).toBe(74);expect(therapy.documentation).toContain('EXTENDED ENCOUNTER');
  const counseling=getClinicalServiceReference('H0004');expect(counseling.source.pages).toEqual([51]);expect(counseling.serviceDescription).toContain('Problem(s) as identified by an assessment');expect(counseling.serviceDescription).not.toContain('Service Provider');expect(counseling.providerQualifications).not.toContain('assessment and listed');expect(counseling.documentation).toContain('Crisis intervention is reported using H2011');
  const skills=getClinicalServiceReference('H2014');expect(skills.source.pages).toEqual([83]);expect(skills.allowedPlaceOfServiceCodes).toContain('27');expect(skills.placesOfService).not.toContain('could');
  for(const info of [intake,therapy,counseling,skills])expect(info.allowedPlaceOfServiceCodes).toEqual(expect.arrayContaining(['11','99']));
 });
 it('does not let callers mutate shared reference data',()=>{
  const info=getClinicalServiceReference('H2011');info.source.pages.push(81);info.title='changed';
  expect(getClinicalServiceReference('H2011').source.pages).toEqual([80]);
  expect(getClinicalServiceReference('H2011').title).not.toBe('changed');
 });
 it('adds source information to existing mapped medical catalog rows',()=>{
  const row=AgencyMedicalServiceCode.mapRow({id:8,agency_id:3,service_code:'H2011',is_active:0});
  expect(row.isActive).toBe(false);expect(row.serviceInfo.source.pages).toEqual([80]);
 });
 it.each(['itsco','nlu','tisi'])('adds H-code reference to %s without changing existing company scope',slug=>{
  const previous={slug:'scope',bodyHtml:`${slug} company scope stays exact`};
  const source={sections:[previous]};applyNarrivaServiceHandbookAmendment(source);applyNarrivaServiceHandbookAmendment(source);
  const section=source.sections.find(section=>section.slug===H2011_HANDBOOK_SLUG);
  expect(section.parentSlug).toBe('clinical-service-reference');expect(section.sourcePage).toBe(80);
  expect(section.bodyHtml).toContain('Bachelor');expect(section.bodyHtml).toContain('no new fee or pay rate');
  expect(source.sections).toHaveLength(3);expect(source.sections[0]).toBe(previous);
 });
});
describe('base H2011 billing boundaries',()=>{
 it('provides a dedicated crisis-intervention tool with the shared section contract and role limits',()=>{
  const tool=getNoteAidToolById('clinical_h2011_note');
  expect(tool.sectionSchema).toBe('soip');expect(tool.kbFolders).toEqual(['shared']);
  expect(tool.systemPrompt).toContain('authorized QBHA and bachelor');expect(tool.systemPrompt).toContain('not psychotherapy 90839');
  expect(tool.systemPrompt).toContain('Never introduce client');expect(tool.systemPrompt).toContain('Do not infer consent');
  expect(tool.systemPrompt).toContain('never automatic substitution');
 });
 it('seeds 16 units and requires review after247 without automatic S9485 or new rates',()=>{
  expect(h2011).toMatchObject({unitCalcMode:'MEDICAID_8_MINUTE_LADDER',unitMinutes:15,minMinutes:8,maxMinutes:247,maxUnitsPerSession:16,maxUnitsPerDay:null,overflowServiceCode:null,overflowAtMinutes:null});
  expect(h2011.allowedCredentialTiers).toEqual(['qbha','bachelors','intern_plus']);
  expect(DEFAULT_MEDICAL_SERVICE_CODES.some(row=>row.serviceCode==='S9485')).toBe(false);
  expect(PAYROLL_SERVICE_CODE_DEFAULTS.get('H2011')).not.toHaveProperty('rate');
 });
 it.each(['unknown','', 'unrecognized'])('does not grant base H2011 to an unverified %s tier through a fallback or saved allowlist',tier=>{
  expect(eligibleServiceCodesForTier(tier)).not.toContain('H2011');
  expect(()=>assertServiceCodeAllowed({tier,serviceCode:'H2011',allowedCodes:['H2011']})).toThrow();
 });
 it.each([['qbha'],['bachelors'],['intern_plus']])('allows qualified application tier %s',tier=>{
  expect(()=>assertServiceCodeAllowed({tier,serviceCode:'H2011'})).not.toThrow();
 });
 it.each([[7,0,false],[8,1,true],[15,1,true],[16,1,true],[22,1,true],[23,2,true],[127,8,true],[128,9,true],[233,16,true],[247,16,true],[248,0,false]])('%i minutes resolves safely', (minutes,units,claimable)=>{
  const result=resolveSessionBilling({...h2011,minutes,ladderBandsJson:buildMedicaid8MinuteBands({unitMinutes:15,minMinutes:8,maxUnits:16})});
  expect(result.claimable).toBe(claimable);if(claimable) expect(result.units).toBe(units);
  expect(result.effectiveServiceCode).toBe('H2011');expect(result.overflowApplied).toBe(false);
 });
});
describe('authorized service-reference endpoint',()=>{
 beforeEach(()=>vi.restoreAllMocks());
 it('checks company access before returning any reference',async()=>{
  const denied=Object.assign(new Error('Denied'),{status:403});vi.spyOn(ClinicalEligibilityService,'ensureAgencyAccess').mockRejectedValue(denied);
  const res={json:vi.fn()},next=vi.fn();await getServiceReference({query:{agencyId:8},params:{serviceCode:'H2011'},user:{id:1}},res,next);
  expect(res.json).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(denied);
 });
 it('returns sourced information after agency verification',async()=>{
  vi.spyOn(ClinicalEligibilityService,'ensureAgencyAccess').mockResolvedValue();const res={json:vi.fn()},next=vi.fn();
  await getServiceReference({query:{agencyId:8},params:{serviceCode:'H2011'},user:{id:1}},res,next);
  expect(res.json).toHaveBeenCalledWith({serviceInfo:expect.objectContaining({code:'H2011',source:expect.objectContaining({pages:[80]})})});
 });
});
