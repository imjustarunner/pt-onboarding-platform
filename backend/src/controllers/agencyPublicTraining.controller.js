import AgencyPublicTraining from '../models/AgencyPublicTraining.model.js';
import { validationResult } from 'express-validator';
import TrainingTrack from '../models/TrainingTrack.model.js';
import Module from '../models/Module.model.js';

export const assignTrainingFocus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { agencyId, trainingFocusId } = req.body;
    const createdByUserId = req.user?.id;

    if (!agencyId || !trainingFocusId) {
      return res.status(400).json({ error: { message: 'Agency ID and Training Focus ID are required' } });
    }

    if (!createdByUserId) {
      return res.status(401).json({ error: { message: 'User authentication required' } });
    }

    // Verify training focus exists
    const trainingFocus = await TrainingTrack.findById(trainingFocusId);
    if (!trainingFocus) {
      return res.status(404).json({ error: { message: 'Training Focus not found' } });
    }

    const assignment = await AgencyPublicTraining.assignTrainingFocus(agencyId, trainingFocusId, createdByUserId);
    
    if (!assignment) {
      return res.status(400).json({ error: { message: 'Failed to assign training focus' } });
    }

    res.status(201).json({
      message: 'Training Focus assigned as public successfully',
      assignment
    });
  } catch (error) {
    console.error('Error in assignTrainingFocus controller:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      errno: error.errno,
      stack: error.stack,
      body: req.body
    });
    next(error);
  }
};

export const assignModule = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { agencyId, moduleId } = req.body;
    const createdByUserId = req.user?.id;

    if (!agencyId || !moduleId) {
      return res.status(400).json({ error: { message: 'Agency ID and Module ID are required' } });
    }

    if (!createdByUserId) {
      return res.status(401).json({ error: { message: 'User authentication required' } });
    }

    // Verify module exists
    const module = await Module.findById(moduleId);
    if (!module) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }

    const assignment = await AgencyPublicTraining.assignModule(agencyId, moduleId, createdByUserId);
    
    if (!assignment) {
      return res.status(400).json({ error: { message: 'Failed to assign module' } });
    }

    res.status(201).json({
      message: 'Module assigned as public successfully',
      assignment
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicTrainings = async (req, res, next) => {
  try {
    const { agencyId } = req.params;

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    // Parse agencyId to ensure it's a number
    const parsedAgencyId = parseInt(agencyId, 10);
    if (isNaN(parsedAgencyId)) {
      return res.status(400).json({ error: { message: 'Invalid Agency ID' } });
    }

    const publicTrainings = await AgencyPublicTraining.getAllPublicTrainings(parsedAgencyId);
    
    res.json(publicTrainings);
  } catch (error) {
    console.error('Error in getPublicTrainings controller:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      errno: error.errno,
      stack: error.stack
    });
    next(error);
  }
};

export const removeTrainingFocus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agencyId } = req.query;

    if (!id || !agencyId) {
      return res.status(400).json({ error: { message: 'ID and Agency ID are required' } });
    }

    const removed = await AgencyPublicTraining.removeTrainingFocusById(id);
    
    if (!removed) {
      return res.status(404).json({ error: { message: 'Training Focus assignment not found' } });
    }

    res.json({ message: 'Training Focus removed from public assignments successfully' });
  } catch (error) {
    next(error);
  }
};

export const removeModule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agencyId } = req.query;

    if (!id || !agencyId) {
      return res.status(400).json({ error: { message: 'ID and Agency ID are required' } });
    }

    const removed = await AgencyPublicTraining.removeModuleById(id);
    
    if (!removed) {
      return res.status(404).json({ error: { message: 'Module assignment not found' } });
    }

    res.json({ message: 'Module removed from public assignments successfully' });
  } catch (error) {
    next(error);
  }
};

