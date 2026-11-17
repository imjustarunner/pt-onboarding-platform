import vm from 'node:vm';
import {parse} from '@babel/parser';
import {it,expect} from 'vitest';
import file from '../ScheduleAvailabilityGrid.vue?raw';
const script=file.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1];
const node=parse(script,{sourceType:'module'}).program.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='normalizeBookingSelectionPayload'));
const source=script.slice(node.start,node.end);
function payload(extra={}){const ctx={normalizeCodeValue:v=>String(v||'').toUpperCase(),tutoringSessionPricePayload:()=>null};for(const [,name]of source.matchAll(/\b(\w+)\.value/g))ctx[name]={value:null};const values={showClinicalBookingFields:false,isSessionBookingRequestType:true,requestType:'individual_session',primarySessionClientId:2545,editorAppointmentId:0,editorClinicalSessionId:0,editorAddonServiceCodes:[],bookingServiceCode:'TUTORING',editorModality:'IN_PERSON',bookingModality:'TELEHEALTH',editorAgencyId:453,editorTenantServiceId:320,editorServiceLocationId:128,editorTutoringSubjectApplicable:true,editorTutoringSubject:'service:1038',virtualSessionSelectedClientIds:[2545],...extra};for(const[name,value]of Object.entries(values))ctx[name]={value};return vm.runInNewContext(source+';normalizeBookingSelectionPayload()',ctx);}
it('keeps a pure tutoring in-person booking as a session despite disabled medical billing and stale legacy virtual state',()=>{expect(payload()).toMatchObject({appointmentTypeCode:'SESSION',serviceCode:'TUTORING',modality:'IN_PERSON',tenantServiceId:320,learningSubjectKey:'service:1038',clientId:2545});});
it('retains explicit General and package choices without inventing a clinical code',()=>{expect(payload({editorTutoringSubject:'general',editorPackageEntitlementId:3})).toMatchObject({serviceCode:'TUTORING',learningSubjectKey:'general',packageEntitlementId:3});});
