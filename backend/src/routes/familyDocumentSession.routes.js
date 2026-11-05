import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  confirmFamilyDocumentBirthday,
  confirmFamilyDocumentDemographics,
  createFamilyDocumentSession,
  getPublicFamilyDocumentSession,
  listFamilyDocumentCandidates
} from '../services/familyDocumentSession.service.js';
import {
  getFamilyIntroductionReminder,
  optInFamilyIntroductionReminders
} from '../services/familyIntroductionEmail.service.js';

function sendError(res, error, next) {
  if (error?.status) return res.status(error.status).json({ error: { message: error.message } });
  return next(error);
}

const staff = express.Router();
staff.use(authenticate);
staff.get('/candidates/:clientId', async (req, res, next) => {
  try {
    res.json(await listFamilyDocumentCandidates({ actor: req.user, clientId: req.params.clientId }));
  } catch (error) {
    sendError(res, error, next);
  }
});
staff.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await createFamilyDocumentSession({ actor: req.user, body: req.body }));
  } catch (error) {
    sendError(res, error, next);
  }
});

const documents = express.Router();
documents.get('/:token', async (req, res, next) => {
  try {
    res.json(await getPublicFamilyDocumentSession(req.params.token));
  } catch (error) {
    sendError(res, error, next);
  }
});
documents.post('/:token/birthday', async (req, res, next) => {
  try {
    res.json(await confirmFamilyDocumentBirthday({
      token: req.params.token,
      clientId: req.body?.clientId,
      dateOfBirth: req.body?.dateOfBirth
    }));
  } catch (error) {
    sendError(res, error, next);
  }
});
documents.post('/:token/demographics', async (req, res, next) => {
  try {
    res.json(await confirmFamilyDocumentDemographics({
      token: req.params.token,
      itemId: req.body?.itemId,
      confirmed: req.body?.confirmed === true,
      actor: req.user || null
    }));
  } catch (error) {
    sendError(res, error, next);
  }
});

const introduction = express.Router();
introduction.get('/reminders/:token', async (req, res, next) => {
  try {
    res.json(await getFamilyIntroductionReminder(req.params.token));
  } catch (error) {
    sendError(res, error, next);
  }
});
introduction.post('/reminders/:token', async (req, res, next) => {
  try {
    res.json(await optInFamilyIntroductionReminders(req.params.token));
  } catch (error) {
    sendError(res, error, next);
  }
});

export default staff;
export { documents as publicFamilyDocumentRoutes, introduction as publicFamilyIntroductionRoutes };
