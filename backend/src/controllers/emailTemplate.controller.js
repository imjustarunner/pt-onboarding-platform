import EmailTemplate from '../models/EmailTemplate.model.js';
import EmailTemplateService from '../services/emailTemplate.service.js';
import PlatformBranding from '../models/PlatformBranding.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import CommunicationLoggingService from '../services/communicationLogging.service.js';
import EmailService from '../services/email.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { callGeminiText } from '../services/geminiText.service.js';

export const getTemplates = async (req, res, next) => {
  try {
    const { agencyId, platformOnly, templateType } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Determine which templates user can access
    let filters = {};

    if (platformOnly === 'true') {
      // Only platform templates
      filters.platformOnly = true;
    } else if (agencyId) {
      // Specific agency templates
      const parsedAgencyId = parseInt(agencyId);
      
      // Verify access (super_admin can see all, others only their agencies)
      if (userRole !== 'super_admin') {
        const userAgencies = await User.getAgencies(userId);
        const userAgencyIds = userAgencies.map(a => a.id);
        
        if (!userAgencyIds.includes(parsedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
      }
      
      filters.agencyId = parsedAgencyId;
    } else {
      // All templates user has access to
      if (userRole !== 'super_admin') {
        const userAgencies = await User.getAgencies(userId);
        const userAgencyIds = userAgencies.map(a => a.id);
        // For non-super-admins, we'll return templates for their agencies + platform defaults
        filters.agencyId = null; // This will be handled in the query
      }
    }

    if (templateType) {
      filters.templateType = templateType;
    }

    const templates = await EmailTemplate.findAll(filters);
    res.json(templates);
  } catch (error) {
    next(error);
  }
};

export const getTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await EmailTemplate.findById(id);
    
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Verify access
    if (req.user.role !== 'super_admin' && template.agency_id) {
      const userAgencies = await User.getAgencies(req.user.id);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(template.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    res.json(template);
  } catch (error) {
    next(error);
  }
};

export const createTemplate = async (req, res, next) => {
  try {
    const { name, type, subject, body, agencyId, platformBrandingId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate required fields
    if (!name || !type || !subject || !body) {
      return res.status(400).json({ error: { message: 'Name, type, subject, and body are required' } });
    }

    // Determine if this is a platform template
    // Check query parameter first, then body, then platformBrandingId
    const isPlatformTemplate = !agencyId && (
      req.query.platform === 'true' || 
      req.body.platform === 'true' || 
      platformBrandingId
    );

    // Access control
    if (isPlatformTemplate && userRole !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can create platform templates' } });
    }

    if (agencyId && userRole !== 'super_admin') {
      // Verify user has access to this agency
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(parseInt(agencyId))) {
        return res.status(403).json({ error: { message: 'Access denied to this agency' } });
      }
    }

    // Get platform branding ID if creating platform template
    let finalPlatformBrandingId = platformBrandingId;
    if (isPlatformTemplate && !finalPlatformBrandingId) {
      const platformBranding = await PlatformBranding.get();
      if (platformBranding && platformBranding.id) {
        finalPlatformBrandingId = platformBranding.id;
      }
    }

    const template = await EmailTemplate.create({
      name,
      type,
      subject,
      body,
      agencyId: agencyId ? parseInt(agencyId) : null,
      platformBrandingId: finalPlatformBrandingId,
      createdByUserId: userId
    });

    res.status(201).json(template);
  } catch (error) {
    // No longer checking for duplicate entries - multiple templates of same type are allowed
    next(error);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type, subject, body, agencyId, platformBrandingId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Access control
    if (template.agency_id && userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(template.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    if (!template.agency_id && userRole !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can edit platform templates' } });
    }

    const updated = await EmailTemplate.update(id, {
      name,
      type,
      subject,
      body,
      agencyId: agencyId !== undefined ? (agencyId ? parseInt(agencyId) : null) : undefined,
      platformBrandingId
    });

    res.json(updated);
  } catch (error) {
    // No longer checking for duplicate entries - multiple templates of same type are allowed
    next(error);
  }
};

export const deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Access control
    if (!template.agency_id && userRole !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can delete platform templates' } });
    }

    if (template.agency_id && userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(template.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const deleted = await EmailTemplate.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getAvailableParameters = async (req, res, next) => {
  try {
    const parameters = EmailTemplateService.getAvailableParameters();
    res.json(parameters);
  } catch (error) {
    next(error);
  }
};

export const previewTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sampleData } = req.body;

    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Use sample data or default values
    const parameters = sampleData || {
      FIRST_NAME: 'John',
      LAST_NAME: 'Doe',
      USERNAME: 'john.doe@example.com',
      TEMP_PASSWORD: 'TempPass123!',
      AGENCY_NAME: 'Example Agency',
      TERMINOLOGY_SETTINGS: 'People Operations',
      PEOPLE_OPS_EMAIL: 'onboarding@example.com',
      PORTAL_URL: 'example.app.plottwistco.com',
      PORTAL_LOGIN_LINK: 'https://example.app.plottwistco.com/example-org/login',
      RESET_TOKEN_LINK: 'https://example.app.plottwistco.com/example-org/reset-password/sample-token',
      DOCUMENT_DEADLINE: 'January 15, 2024',
      TRAINING_DEADLINE: 'January 20, 2024',
      SENDER_NAME: 'Admin User'
    };

    const rendered = EmailTemplateService.renderTemplate(template, parameters);

    res.json({
      template,
      rendered,
      parameters
    });
  } catch (error) {
    next(error);
  }
};

const normalizeRecipients = (recipients) => {
  if (!recipients) return [];
  if (Array.isArray(recipients)) {
    return recipients
      .map((r) => (typeof r === 'string' ? r : r?.email))
      .map((r) => String(r || '').trim())
      .filter(Boolean);
  }
  if (typeof recipients === 'string') {
    return recipients
      .split(/[\n,;]+/)
      .map((r) => String(r || '').trim())
      .filter(Boolean);
  }
  return [];
};

const buildSenderName = (user) => {
  if (!user) return 'Admin';
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return name || user.email || 'Admin';
};

const ensureAgencyAccess = async ({ userId, userRole, agencyId }) => {
  if (!agencyId) return;
  if (userRole === 'super_admin') return;
  const userAgencies = await User.getAgencies(userId);
  const userAgencyIds = userAgencies.map((a) => a.id);
  if (!userAgencyIds.includes(Number(agencyId))) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
};

const ensureTemplateAccess = async ({ template, userId, userRole }) => {
  if (!template) {
    const err = new Error('Template not found');
    err.status = 404;
    throw err;
  }
  if (userRole !== 'super_admin' && template.agency_id) {
    const userAgencies = await User.getAgencies(userId);
    const userAgencyIds = userAgencies.map((a) => a.id);
    if (!userAgencyIds.includes(template.agency_id)) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
  }
  if (userRole !== 'super_admin' && !template.agency_id) {
    const err = new Error('Only super admins can access platform templates');
    err.status = 403;
    throw err;
  }
};

export const sendTemplateEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      recipients,
      subject,
      body,
      parameters,
      agencyId,
      senderIdentityId
    } = req.body || {};

    const toList = normalizeRecipients(recipients);
    if (!toList.length) {
      return res.status(400).json({ error: { message: 'Recipients are required' } });
    }

    if (req.user.role !== 'super_admin' && !agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    await ensureAgencyAccess({ userId: req.user.id, userRole: req.user.role, agencyId });

    const template = await EmailTemplate.findById(id);
    await ensureTemplateAccess({ template, userId: req.user.id, userRole: req.user.role });

    const agency = agencyId ? await Agency.findById(agencyId) : null;
    const senderUser = await User.findById(req.user.id);
    const senderName = buildSenderName(senderUser);

    const baseParams = await EmailTemplateService.collectParameters(null, agency, {
      senderName
    });
    const mergedParams = { ...baseParams, ...(parameters || {}) };

    const rendered = subject || body
      ? { subject: String(subject || ''), body: String(body || '') }
      : EmailTemplateService.renderTemplate(template, mergedParams);

    const results = [];

    for (const to of toList) {
      const existingUser = await User.findByEmail(to).catch(() => null);
      const comm = await CommunicationLoggingService.logGeneratedCommunication({
        userId: existingUser?.id || null,
        agencyId: agencyId || null,
        templateType: template.type || 'manual',
        templateId: template.id || null,
        subject: rendered.subject,
        body: rendered.body,
        generatedByUserId: req.user.id,
        channel: 'email',
        recipientAddress: to
      }).catch(() => null);

      let sendResult = null;
      if (senderIdentityId) {
        sendResult = await sendEmailFromIdentity({
          senderIdentityId,
          to,
          subject: rendered.subject,
          text: rendered.body,
          html: null,
          source: 'manual'
        });
      } else {
        sendResult = await EmailService.sendEmail({
          to,
          subject: rendered.subject,
          text: rendered.body,
          html: null,
          fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || senderName,
          fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
          replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
          source: 'manual'
        });
      }

      if (comm?.id && sendResult?.id) {
        await CommunicationLoggingService.markAsSent(comm.id, sendResult.id, {
          senderIdentityId: senderIdentityId || null,
          fromEmail: senderIdentityId ? undefined : (process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || null)
        }).catch(() => {});
      }

      results.push({ to, result: sendResult || { skipped: true } });
    }

    res.json({
      message: 'Email sent',
      templateId: template.id,
      results
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ error: { message: error.message } });
    }
    next(error);
  }
};

export const aiDraftTemplateEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { prompt, parameters, agencyId } = req.body || {};

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: { message: 'prompt is required' } });
    }

    if (req.user.role !== 'super_admin' && !agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    await ensureAgencyAccess({ userId: req.user.id, userRole: req.user.role, agencyId });

    const template = await EmailTemplate.findById(id);
    await ensureTemplateAccess({ template, userId: req.user.id, userRole: req.user.role });

    const agency = agencyId ? await Agency.findById(agencyId) : null;
    const senderUser = await User.findById(req.user.id);
    const senderName = buildSenderName(senderUser);

    const baseParams = await EmailTemplateService.collectParameters(null, agency, {
      senderName
    });
    const mergedParams = { ...baseParams, ...(parameters || {}) };
    const available = EmailTemplateService.getAvailableParameters();
    const paramList = available.map((p) => `${p.name}: ${p.description}`).join('\n');

    const aiPrompt = [
      'You are drafting an email for an admin user.',
      'Use the provided template as the starting point and adapt tone/wording to the prompt.',
      'Keep placeholders using {{PARAMETER}} format when you do not have a concrete value.',
      'Return ONLY valid JSON with keys: subject, body.',
      '',
      'Template subject:',
      template.subject || '',
      '',
      'Template body:',
      template.body || '',
      '',
      'Available parameters:',
      paramList,
      '',
      'Known parameter values (may be empty):',
      JSON.stringify(mergedParams, null, 2),
      '',
      'Admin prompt:',
      String(prompt).trim()
    ].join('\n');

    const { text } = await callGeminiText({ prompt: aiPrompt, temperature: 0.3, maxOutputTokens: 800 });
    const trimmed = String(text || '').trim();
    const jsonText = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    let parsed = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return res.status(502).json({ error: { message: 'AI response was not valid JSON' } });
    }

    const subjectOut = String(parsed?.subject || '').trim();
    const bodyOut = String(parsed?.body || '').trim();

    if (!subjectOut || !bodyOut) {
      return res.status(502).json({ error: { message: 'AI response missing subject or body' } });
    }

    res.json({
      templateId: template.id,
      subject: subjectOut,
      body: bodyOut,
      parameters: mergedParams
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ error: { message: error.message } });
    }
    next(error);
  }
};
