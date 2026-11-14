import test from 'node:test';import assert from 'node:assert/strict';
import {extractPaperPacketDemographics,paperPacketDemographicFill} from '../paperPacketDemographics.util.js';
import {paperPacketLocale,paperWrittenResponses} from '../paperPacketLocale.js';
import {extractVersionLabelFromText,detectSignaturesFromText,detectDenyStaffFromText} from '../paperPacketVisionParse.util.js';
const source=`Nombre del dependiente: José Prueba\nFecha de nacimiento del dependiente: 23/09/2023\nSexo del dependiente: Masculino\nGrado del dependiente: Tercero\nDirección del dependiente: 100 Calle Ejemplo\nCiudad del dependiente: Ciudad de Ejemplo\nEstado: CO\nCódigo postal: 80000\nSu nombre: María Prueba\nSu teléfono: 719-555-0101\nSu correo electrónico: demo@example.com\nIdioma preferido del dependiente: Español\nRelación con el cliente: Madre\nSeguro primario: CHAMPVA\nTitular de la póliza: María Prueba\nNúmero de identificación de miembro: 000000000-00\nSeguro secundario: Colorado Medicaid\nTitular secundario: María Prueba\nNúmero de identificación secundario: A123456\nHistorial de abuso físico ___ Sí ___ No\nPor favor explique:\nNo hubo abuso.\nPor favor enumere cualquier información médica necesaria, incluyendo alergias alimentarias.\nNo tiene alergias.\nPor favor seleccione la respuesta que mejor describa a su dependiente:\nNunca A veces Frecuentemente`;
test('reads the Spanish template into English form values without changing identities or insurance numbers',()=>{
 const p=extractPaperPacketDemographics(source);assert.equal(p.sourceLocale,'es');assert.equal(p.fullName,'José Prueba');assert.equal(p.guardianName,'María Prueba');assert.equal(p.addressStreet,'100 Calle Ejemplo');assert.equal(p.dateOfBirth,'2023-09-23');assert.equal(p.administrativeSex,'Male');assert.equal(p.grade,'3');assert.equal(p.preferredLanguage,'Spanish');assert.equal(p.guardianRelationship,'Mother');assert.equal(p.memberId,'000000000-00');assert.equal(p.secondaryMemberId,'A123456');assert.equal(p.sourceValues.administrativeSex,'Masculino');assert.equal(p.responses.length,2);assert.equal(p.responses[1].sourceText,'No tiene alergias.');assert.equal(p.responses[1].englishText,'');
 const patch=paperPacketDemographicFill({},p);assert.equal(patch.gender,'Male');assert.equal(patch.preferred_language,'Spanish');
});
test('leaves an ambiguous Spanish numeric birth date for review while accepting ISO and an English date label',()=>{
 const ambiguous=extractPaperPacketDemographics(source.replace('23/09/2023','03/09/2023'));assert.equal(ambiguous.dateOfBirth,null);assert.equal(ambiguous.dateOfBirthNeedsReview,true);assert.equal(ambiguous.sourceValues.dateOfBirth,'03/09/2023');
 assert.equal(extractPaperPacketDemographics(source.replace('23/09/2023','2023-09-23')).dateOfBirth,'2023-09-23');assert.equal(extractPaperPacketDemographics("Dependent's Date of Birth: 03/09/2023",{locale:'es'}).dateOfBirth,'2023-03-09');
});
test('reads wrapped printed Spanish labels and paired insurance columns without treating prompt continuation as an answer',()=>{
 const value=extractPaperPacketDemographics('Nombre del\ndependiente\nJosé Prueba\nFecha de nacimiento\ndel dependiente\n23/09/2023\nSeguro primario CHAMPVA Seguro secundario Colorado Medicaid\nTitular de la póliza María Prueba Titular secundario María Prueba\nNúmero de identificación\nde miembro 000000000-00 Número de identificación secundario A123456\nPor favor enumere cualquier información médica\nnecesaria, incluyendo alergias alimentarias.\nNo tiene alergias.');
 assert.equal(value.fullName,'José Prueba');assert.equal(value.dateOfBirth,'2023-09-23');assert.equal(value.primaryInsurance,'CHAMPVA');assert.equal(value.secondaryInsurance,'Colorado Medicaid');assert.equal(value.secondaryMemberId,'A123456');assert.equal(value.responses[0].sourceText,'No tiene alergias.');
 assert.equal(extractPaperPacketDemographics('Fecha de nacimiento del dependiente: 31/02/2023').dateOfBirth,null);
});
test('recognizes only explicit Spanish legal answer marks and retains unanswered printed options',()=>{
 const p=extractPaperPacketDemographics('Nombre del dependiente José Prueba\nSeguro primario Medicaid\n¿Es usted el padre/madre legal o custodio del menor mencionado anteriormente? X Sí ___ No\nTengo el derecho legal de obtener tratamiento para el menor mencionado anteriormente: ___ Sí ___ No');assert.equal(p.legalCustodian,'yes');assert.equal(p.legalRightToTreat,null);
});
test('keeps questionnaire choices and printed consents out of narrative translation',()=>{
 const answers=paperWrittenResponses(source,'es');assert.equal(answers.length,2);assert.ok(answers.every(a=>!a.sourceText.includes('Frecuentemente')));assert.equal(paperPacketLocale(source),'es');
});
test('reads Spanish version and signature cues but still requires source review',()=>{
 assert.equal(extractVersionLabelFromText('Versión del paquete 1.02').label,'1.02');
 const result=detectSignaturesFromText('Firme aquí — requerido\nMaría Prueba Fecha 11/14/2026\nFirme aquí — requerido\nMaría Prueba Fecha 11/14/2026');assert.equal(result.roiSignatureDetected,true);assert.equal(result.disclosureSignatureDetected,true);
 assert.deepEqual(detectDenyStaffFromText('José García Denegar X',[{id:4,firstName:'José',lastName:'García'}]).denyStaffUserIds,[4]);
});
