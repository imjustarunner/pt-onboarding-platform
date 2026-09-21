import User from '../models/User.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import HiringResumeParse from '../models/HiringResumeParse.model.js';
import HiringResearchReport from '../models/HiringResearchReport.model.js';
import { generatePreScreenReportWithGoogleSearch, generatePreScreenReportWithVertexNoSearch, generatePreScreenReportWithGeminiApiKey } from './preScreenResearch.service.js';

// Called after the HTTP authorization guard, or by the tenant-scoped preparation worker.
export async function prepareCandidatePreScreen({ candidateUserId, agencyId, createdByUserId = null, overrides = {} }) {
    const user = await User.findById(candidateUserId);
    if (!user) throw Object.assign(new Error('Candidate not found'), { status: 404 });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    let jobDescription = null;
    if (profile?.job_description_id) {
      const jd = await HiringJobDescription.findById(profile.job_description_id);
      if (jd && Number(jd.agency_id) === Number(agencyId) && (jd.is_active === 1 || jd.is_active === true)) {
        jobDescription = jd;
      }
    }

    const candidateNameFromDb = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const candidateName = String(overrides?.candidateName || candidateNameFromDb || '').trim();
    // Prefer extracted resume text from uploaded resume(s).
    // Allow manual override via req.body.resumeText, but default should “just work” after upload.
    let resumeText = String(overrides?.resumeText || '').trim();
    if (!resumeText) {
      try {
        const latest = await HiringResumeParse.findLatestCompletedTextByCandidateUserId(candidateUserId);
        resumeText = String(latest?.extracted_text || '').trim();
      } catch (e) {
        // If the table isn't migrated yet, fall back to requiring manual paste.
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }
    resumeText = resumeText.slice(0, 20000);
    const linkedInUrl = String(overrides?.linkedInUrl || '').trim().slice(0, 800);
    const psychologyTodayUrl = String(overrides?.psychologyTodayUrl || '').trim().slice(0, 900);
    const candidateLocation = String(overrides?.candidateLocation || '').trim().slice(0, 180);
    const coverLetterText = String(overrides?.coverLetterText || profile?.cover_letter_text || '').trim().slice(0, 20000);

    // Prefer job description associated with the candidate profile; allow override via request.
    const jobTitle = String(overrides?.jobTitle || jobDescription?.title || '').trim().slice(0, 255);
    const jobDescriptionText = String(overrides?.jobDescriptionText || jobDescription?.description_text || '').trim().slice(0, 60000);

    if (!resumeText) throw Object.assign(new Error('No resume text available yet. Upload a resume or paste text.'), { status: 400 });

    const started = Date.now();
    let ai;
    try {
      try {
        // Preferred (grounded) path: Vertex AI with Google Search tool.
        ai = await generatePreScreenReportWithGoogleSearch({
          candidateName,
          resumeText,
          linkedInUrl,
          psychologyTodayUrl,
          candidateLocation,
          jobTitle,
          jobDescriptionText,
          coverLetterText
        });
      } catch (e) {
        // Common in some environments: Vertex+Search grounding is not permitted (403),
        // or the Vertex project/env is not configured yet (503). Fall back gracefully:
        // 1) Try Vertex without Search tool
        // 2) If GEMINI_API_KEY configured, try the API key path
        const status = e?.status;
        const canFallbackStatus = status === 403 || status === 401 || status === 503;
        if (!canFallbackStatus) throw e;

        try {
          ai = await generatePreScreenReportWithVertexNoSearch({
            candidateName,
            resumeText,
            linkedInUrl,
            psychologyTodayUrl,
            candidateLocation,
            jobTitle,
            jobDescriptionText,
            coverLetterText
          });
        } catch (e2) {
          ai = await generatePreScreenReportWithGeminiApiKey({
            candidateName,
            resumeText,
            linkedInUrl,
            psychologyTodayUrl,
            candidateLocation,
            jobTitle,
            jobDescriptionText,
            coverLetterText
          });
        }
      }
    } catch (e) { throw e; }

    const warnings = [];
    if (!ai.isGrounded) {
      warnings.push('No source links were returned by Google Search grounding. Treat this output as unverified and review manually.');
    }

    const reportText = [
      warnings.length ? `## Warnings\n- ${warnings.join('\n- ')}\n` : '',
      ai.text
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()
      .slice(0, 50000);

    const report = await HiringResearchReport.create({
      candidateUserId,
      status: 'completed',
      reportText,
      reportJson: {
        kind: 'prescreen',
        model: ai.modelId,
        latencyMs: ai.latencyMs,
        totalMs: Date.now() - started,
        isGrounded: ai.isGrounded,
        input: {
          candidateName: String(candidateName || '').slice(0, 180) || null,
          linkedInUrl: linkedInUrl || null,
          resumeTextLength: resumeText.length,
          coverLetterTextLength: coverLetterText ? coverLetterText.length : 0,
          jobTitle: jobTitle || null,
          jobDescriptionTextLength: jobDescriptionText ? jobDescriptionText.length : 0,
          jobDescriptionId: jobDescription?.id || null
        },
        grounding: ai.groundingMetadata || null
      },
      createdByUserId: createdByUserId,
      isAiGenerated: true
    });

    return report;
}
