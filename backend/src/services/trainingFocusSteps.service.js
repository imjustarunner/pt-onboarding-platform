import TrainingFocusStep from '../models/TrainingFocusStep.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import CustomChecklistItem from '../models/CustomChecklistItem.model.js';

const VALID_STEP_TYPES = ['module', 'checklist_item', 'document'];

class TrainingFocusStepsService {
  static async listSteps(trainingFocusId) {
    return TrainingFocusStep.findByFocusId(trainingFocusId);
  }

  static async addStep(trainingFocusId, payload) {
    const {
      stepType,
      referenceId,
      orderIndex,
      documentActionType,
      dueDateDays,
      titleOverride
    } = payload;

    if (!VALID_STEP_TYPES.includes(stepType)) {
      throw Object.assign(new Error('Invalid step type'), { statusCode: 400 });
    }
    if (!referenceId) {
      throw Object.assign(new Error('referenceId is required'), { statusCode: 400 });
    }

    const focus = await TrainingTrack.findById(trainingFocusId);
    if (!focus) {
      throw Object.assign(new Error('Training focus not found'), { statusCode: 404 });
    }

    await this._validateReference(stepType, referenceId, trainingFocusId);

    const step = await TrainingFocusStep.create({
      trainingFocusId,
      stepType,
      referenceId,
      orderIndex,
      documentActionType: stepType === 'document' ? documentActionType || 'signature' : null,
      dueDateDays,
      titleOverride
    });

    await this._syncLegacyLink(step, trainingFocusId);
    return step;
  }

  static async removeStep(trainingFocusId, stepId) {
    const step = await TrainingFocusStep.findById(stepId);
    if (!step || step.trainingFocusId !== Number(trainingFocusId)) {
      throw Object.assign(new Error('Step not found'), { statusCode: 404 });
    }
    await TrainingFocusStep.delete(stepId);
    await this._unsyncLegacyLink(step, trainingFocusId);
    return { ok: true };
  }

  static async reorderSteps(trainingFocusId, stepIdsInOrder) {
    return TrainingFocusStep.reorder(trainingFocusId, stepIdsInOrder);
  }

  static async _validateReference(stepType, referenceId, trainingFocusId) {
    if (stepType === 'module') {
      const Module = (await import('../models/Module.model.js')).default;
      const mod = await Module.findById(referenceId);
      if (!mod) throw Object.assign(new Error('Module not found'), { statusCode: 404 });
      return;
    }
    if (stepType === 'checklist_item') {
      const item = await CustomChecklistItem.findById(referenceId);
      if (!item) throw Object.assign(new Error('Checklist item not found'), { statusCode: 404 });
      return;
    }
    if (stepType === 'document') {
      const DocumentTemplate = (await import('../models/DocumentTemplate.model.js')).default;
      const tpl = await DocumentTemplate.findById(referenceId);
      if (!tpl) throw Object.assign(new Error('Document template not found'), { statusCode: 404 });
    }
  }

  static async _syncLegacyLink(step, trainingFocusId) {
    if (step.stepType === 'module') {
      await TrainingTrack.addModule(trainingFocusId, step.referenceId, step.orderIndex);
      return;
    }
    if (step.stepType === 'checklist_item') {
      const item = await CustomChecklistItem.findById(step.referenceId);
      if (!item) return;
      await CustomChecklistItem.update(step.referenceId, {
        itemKey: item.item_key,
        itemLabel: item.item_label,
        description: item.description,
        isPlatformTemplate: item.is_platform_template,
        agencyId: item.agency_id,
        trainingFocusId,
        moduleId: null,
        orderIndex: step.orderIndex,
        autoAssign: item.auto_assign
      });
    }
  }

  static async _unsyncLegacyLink(step, trainingFocusId) {
    if (step.stepType === 'module') {
      await TrainingTrack.removeModule(trainingFocusId, step.referenceId);
      return;
    }
    if (step.stepType === 'checklist_item') {
      const item = await CustomChecklistItem.findById(step.referenceId);
      if (!item) return;
      await CustomChecklistItem.update(step.referenceId, {
        itemKey: item.item_key,
        itemLabel: item.item_label,
        description: item.description,
        isPlatformTemplate: item.is_platform_template,
        agencyId: item.agency_id,
        trainingFocusId: null,
        moduleId: null,
        orderIndex: item.order_index,
        autoAssign: item.auto_assign
      });
    }
  }
}

export default TrainingFocusStepsService;
