import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChartArtifact,
  isdLooksLikeDisclosure,
  isdLooksLikeSmartSchoolRoi,
  clinicalSignalScore,
  pickBestClinicalSubmission
} from '../clientChartArtifacts.service.js';

test('classifyChartArtifact maps ROI titles including Release of Information', () => {
  assert.equal(
    classifyChartArtifact({ originalName: 'North - Release of Information (Signed)' }),
    'smart_roi'
  );
  assert.equal(classifyChartArtifact({ documentType: 'school_roi' }), 'smart_roi');
  assert.equal(classifyChartArtifact({ title: 'Smart ROI' }), 'smart_roi');
});

test('classifyChartArtifact maps disclosure, HIPAA, and intake packet', () => {
  assert.equal(classifyChartArtifact({ documentType: 'disclosure' }), 'disclosure');
  assert.equal(classifyChartArtifact({ title: 'Disclosure Statement (Signed)' }), 'disclosure');
  assert.equal(classifyChartArtifact({ title: 'Disclosure Agreement' }), 'disclosure');
  assert.equal(
    classifyChartArtifact({
      title: 'Disclosure Agreement',
      originalName: 'North - Release of Information (Signed)'
    }),
    'smart_roi'
  );
  assert.equal(
    classifyChartArtifact({ title: 'HIPAA Privacy Policy and Notice of Privacy Practices (Signed)' }),
    'hipaa_notice'
  );
  assert.equal(classifyChartArtifact({ documentType: 'hipaa_notice' }), 'hipaa_notice');
  assert.equal(classifyChartArtifact({ documentType: 'Intake Packet', title: 'Intake Packet' }), 'packet');
});

test('classifyChartArtifact maps clinical summary and leftover signed forms', () => {
  assert.equal(
    classifyChartArtifact({ documentType: 'clinical_summary', title: 'Clinical Intake Summary' }),
    'clinical_summary'
  );
  assert.equal(classifyChartArtifact({ originalName: 'Consent to Treat (Signed)' }), 'signed_form');
});

test('isdLooksLikeDisclosure ignores ROI stamped onto a Disclosure Agreement template', () => {
  const roiIsd = {
    document_template_name: 'Disclosure Agreement',
    audit_trail: { smartSchoolRoi: true, roiResponse: { clientFullName: 'ChaMar' }, documentName: 'Disclosure Agreement' }
  };
  assert.equal(isdLooksLikeSmartSchoolRoi(roiIsd), true);
  assert.equal(isdLooksLikeDisclosure(roiIsd), false);

  const realDisclosure = {
    document_template_name: 'Disclosure Statement',
    audit_trail: { smartDisclosure: true, documentName: 'Disclosure Statement' }
  };
  assert.equal(isdLooksLikeDisclosure(realDisclosure), true);
  assert.equal(clinicalSignalScore({ smartSchoolRoi: { clientFullName: 'ChaMar' } }), 0);
  assert.ok(clinicalSignalScore({ clinicalResponses: { presenting_problem: 'anxiety at school' } }) > 0);
  assert.ok(clinicalSignalScore({
    responses: { clients: [{ psc_1: 'Sometimes', gain: 'Nothing' }] }
  }) > 0);
  assert.equal(
    pickBestClinicalSubmission([
      { id: 840, intake_data: { smartSchoolRoi: { clientFullName: 'ChaMar' } } },
      { id: 842, intake_data: { responses: { clients: [{ psc_1: 'Sometimes', gain: 'Nothing' }] } } }
    ])?.id,
    842
  );
});
