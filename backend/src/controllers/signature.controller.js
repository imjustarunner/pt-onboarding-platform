import Signature from '../models/Signature.model.js';
import { validationResult } from 'express-validator';

export const saveSignature = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const userId = req.user.id;
    const { moduleId, signatureData } = req.body;

    if (!signatureData) {
      return res.status(400).json({ error: { message: 'Signature data is required' } });
    }

    const signature = await Signature.createOrUpdate({
      userId,
      moduleId,
      signatureData
    });

    res.json(signature);
  } catch (error) {
    next(error);
  }
};

export const getSignature = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { moduleId } = req.params;

    const signature = await Signature.findByUserAndModule(userId, parseInt(moduleId));
    
    if (!signature) {
      return res.status(404).json({ error: { message: 'Signature not found' } });
    }

    res.json(signature);
  } catch (error) {
    next(error);
  }
};

