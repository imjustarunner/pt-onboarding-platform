import test from 'node:test';
import assert from 'node:assert/strict';
import {paperDemographicsTableText} from '../paperDemographicsTable.js';
import {extractPaperPacketDemographics} from '../paperPacketDemographics.util.js';
const word=(text,x,y,width=text.length*6)=>({symbols:[...text].map(text=>({text})),boundingBox:{vertices:[{x,y},{x:x+width,y},{x:x+width,y:y+12},{x,y:y+12}]}});
function fixture(normalized=false){
 const labels=[word('Dependent’s',20,20),word('Name',90,20),word('Dependent’s',20,50),word('Date',90,50),word('of',120,50),word('Birth',20,65),word('Dependent’s',300,50),word('Age',370,50),word('Dependent’s',20,95),word('Sex',90,95),word('Dependent’s',300,95),word('Grade',370,95),word('Dependent’s',20,125),word('Address',90,125),word('Dependent’s',20,155),word('City',90,155),word('State',300,155),word('Zip',420,155),word('Code',442,155)];
 const values=[word('Jordan',180,20),word('Lee',228,20),word('03/14/2015',180,63),word('11',400,63),word('Male',180,95),word('5',400,95),word('123',180,125),word('Main',208,125),word('St',242,125),word('Colorado',180,155),word('Springs',240,155),word('CO',350,155),word('80919',490,155)];
 const words=[...labels,...values];
 if(normalized)for(const w of words){w.boundingBox.normalizedVertices=w.boundingBox.vertices.map(v=>({x:v.x/600,y:v.y/800}));delete w.boundingBox.vertices;}
 return {pages:[{width:600,height:800,blocks:[{paragraphs:[{words}]}]}]};
}
for(const normalized of [false,true])test(`reads handwritten table cells independently of OCR order (${normalized?'PDF coordinates':'pixels'})`,()=>{
 const text=paperDemographicsTableText(fixture(normalized));const parsed=extractPaperPacketDemographics('Consent to release information\nPage 1\nAcknowledgement\nPage 2\nIntake questionnaire',{demographicsText:text});
 assert.equal(parsed.fullName,'Jordan Lee');assert.equal(parsed.dateOfBirth,'2015-03-14');assert.equal(parsed.administrativeSex,'Male');assert.equal(parsed.grade,'5');assert.equal(parsed.addressStreet,'123 Main St');assert.equal(parsed.addressCity,'Colorado Springs');assert.equal(parsed.addressState,'CO');assert.equal(parsed.addressZip,'80919');
});
test('finds intake text after consent pages and does not assign a misplaced birth date as a street',()=>{
 const parsed=extractPaperPacketDemographics("Consent to release information\nSign here\nAcknowledgement\nINTAKE QUESTIONNAIRE\nDependent’s Name Jordan Lee\nDependent’s Date of Birth 03/14/2015\nDependent’s Address 03/14/2015\nHistory of physical abuse\nYour name Wrong Later Name");
 assert.equal(parsed.fullName,'Jordan Lee');assert.equal(parsed.dateOfBirth,'2015-03-14');assert.equal(parsed.addressStreet,null);assert.equal(parsed.guardianName,null);
});

test('reads Spanish table labels and handwritten sex using the same coordinate association',()=>{
 const annotation=fixture();const words=annotation.pages[0].blocks[0].paragraphs[0].words;
 const spanish=[word('Nombre',20,20),word('del',62,20),word('dependiente',85,20),word('Fecha',20,50),word('de',55,50),word('nacimiento',72,50),word('del',20,65),word('dependiente',43,65),word('Edad',300,50),word('del',330,50),word('dependiente',352,50),word('Sexo',20,95),word('del',52,95),word('dependiente',75,95),word('Grado',300,95),word('del',337,95),word('dependiente',360,95),word('Dirección',20,125),word('del',80,125),word('dependiente',103,125),word('Ciudad',20,155),word('del',65,155),word('dependiente',88,155),word('Estado',300,155),word('Código',420,155),word('postal',465,155)];
 const answers=words.slice(19);const male=answers.find(w=>w.symbols.map(s=>s.text).join('')==='Male');male.symbols=[...'Masculino'].map(text=>({text}));annotation.pages[0].blocks[0].paragraphs[0].words=[...spanish,...answers];
 const parsed=extractPaperPacketDemographics('Cuestionario de admisión\nSu correo electrónico',{demographicsText:paperDemographicsTableText(annotation),locale:'es'});
 assert.equal(parsed.fullName,'Jordan Lee');assert.equal(parsed.administrativeSex,'Male');assert.equal(parsed.dateOfBirth,'2015-03-14');assert.equal(parsed.addressStreet,'123 Main St');
});
