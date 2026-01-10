import Acknowledgment from '../models/Acknowledgment.model.js';
import { validationResult } from 'express-validator';

export const acknowledgeModule = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const userId = req.user.id;
    const { moduleId } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const acknowledgment = await Acknowledgment.create({
      userId,
      moduleId,
      ipAddress
    });

    res.json(acknowledgment);
  } catch (error) {
    next(error);
  }
};

export const getAcknowledgment = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { moduleId } = req.params;

    const acknowledgment = await Acknowledgment.findByUserAndModule(userId, parseInt(moduleId));
    
    if (!acknowledgment) {
      return res.status(404).json({ error: { message: 'Acknowledgment not found' } });
    }

    res.json(acknowledgment);
  } catch (error) {
    next(error);
  }
};

export const getUserAcknowledgments = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const acknowledgments = await Acknowledgment.findByUser(userId);
    res.json(acknowledgments);
  } catch (error) {
    next(error);
  }
};

export const checkAcknowledgment = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { moduleId } = req.params;

    const hasAcknowledged = await Acknowledgment.hasAcknowledged(userId, parseInt(moduleId));
    res.json({ acknowledged: hasAcknowledged });
  } catch (error) {
    next(error);
  }
};

