import api from './api';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWhiteboardData(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    strokes: Array.isArray(source.strokes)
      ? source.strokes.map((stroke = {}, index) => ({
          id: stroke.id || createId(`stroke-${index + 1}`),
          color: String(stroke.color || '#F8FAFC'),
          width: Number.isFinite(Number(stroke.width)) ? Number(stroke.width) : 4,
          points: Array.isArray(stroke.points)
            ? stroke.points
                .map((point = {}) => ({
                  x: Number(point.x) || 0,
                  y: Number(point.y) || 0
                }))
                .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
            : []
        }))
      : []
  };
}

function normalizeMaterial(material = {}, index = 0) {
  const config = material?.config && typeof material.config === 'object' ? material.config : {};
  return {
    id: material.id || createId(`material-${index + 1}`),
    sessionId: material.sessionId || null,
    materialType: String(material.materialType || 'activity'),
    sourceId: material.sourceId || null,
    title: String(material.title || 'Untitled material'),
    description: String(material.description || ''),
    positionIndex: Number.isFinite(Number(material.positionIndex)) ? Number(material.positionIndex) : index,
    storagePath: material.storagePath || null,
    externalUrl: material.externalUrl || null,
    mimeType: material.mimeType || null,
    fileSizeBytes: material.fileSizeBytes != null ? Number(material.fileSizeBytes) : null,
    hasFile: !!material.hasFile,
    hasFillablePdf: !!material.hasFillablePdf,
    fileUrl: material.fileUrl || null,
    downloadUrl: material.downloadUrl || null,
    config: {
      fieldDefinitions: Array.isArray(config.fieldDefinitions) ? config.fieldDefinitions : [],
      blocks: Array.isArray(config.blocks) ? config.blocks : [],
      quickChecks: Array.isArray(config.quickChecks) ? config.quickChecks : [],
      ...config
    }
  };
}

function normalizePayload(raw = {}) {
  const plan = raw?.plan && typeof raw.plan === 'object' ? raw.plan : {};
  return {
    session: raw?.session || null,
    actorRole: raw?.actorRole || null,
    canModerate: raw?.canModerate !== undefined ? !!raw.canModerate : true,
    student: raw?.student || null,
    studentRoster: Array.isArray(raw?.studentRoster) ? raw.studentRoster : [],
    availableTemplates: Array.isArray(raw?.availableTemplates) ? raw.availableTemplates : [],
    duplicateCandidates: Array.isArray(raw?.duplicateCandidates) ? raw.duplicateCandidates : [],
    plan: {
      sessionId: plan.sessionId || raw?.session?.id || null,
      studentClientId: plan.studentClientId || raw?.student?.clientId || null,
      studentSnapshot: plan.studentSnapshot || raw?.student || null,
      subjectArea: String(plan.subjectArea || ''),
      gradeLabel: String(plan.gradeLabel || ''),
      focusArea: String(plan.focusArea || ''),
      goals: Array.isArray(plan.goals) ? plan.goals : [],
      outline: Array.isArray(plan.outline) ? plan.outline : [],
      tutorNotes: String(plan.tutorNotes || ''),
      aiContext: plan.aiContext && typeof plan.aiContext === 'object' ? plan.aiContext : {},
      whiteboardData: normalizeWhiteboardData(plan.whiteboardData),
      shareWhiteboardWithGuardian: !!plan.shareWhiteboardWithGuardian,
      layoutPrefs: {
        leftCollapsed: !!plan.layoutPrefs?.leftCollapsed,
        rightCollapsed: !!plan.layoutPrefs?.rightCollapsed,
        focusMode: !!plan.layoutPrefs?.focusMode,
        activeNav: String(plan.layoutPrefs?.activeNav || 'overview')
      }
    },
    materials: Array.isArray(raw?.materials) ? raw.materials.map(normalizeMaterial) : []
  };
}

export function createDemoInPersonPayload(sessionId = 'preview') {
  return normalizePayload({
    session: {
      id: sessionId,
      title: 'In-Person Tutoring - Main Idea and Supporting Details',
      status: 'scheduled',
      organization_id: null,
      organization_slug: null,
      delivery_context: 'in_person',
      session_subtype: 'tutoring'
    },
    actorRole: 'presenter',
    canModerate: true,
    student: {
      clientId: 101,
      name: 'Mia Lopez',
      initials: 'ML',
      membershipStatus: 'active'
    },
    plan: {
      sessionId,
      studentClientId: 101,
      studentSnapshot: {
        clientId: 101,
        name: 'Mia Lopez',
        initials: 'ML'
      },
      subjectArea: 'Reading',
      gradeLabel: 'Grade 4',
      focusArea: 'Main idea, supporting details, and confidence with short passages',
      goals: [
        'Identify the main idea in a one-page reading passage',
        'Underline two supporting details that match the main idea',
        'Practice explaining the answer out loud before writing it'
      ],
      outline: [
        'Warm welcome and confidence check',
        'Read the passage together',
        'Model main-idea thinking with color coding',
        'Independent practice and reflection'
      ],
      tutorNotes: 'Mia benefits from sentence starters and verbal rehearsal before writing. Keep praise specific and brief.',
      aiContext: {
        recentStrengths: ['Strong decoding', 'Willing to retry after a prompt'],
        watchFors: ['Rushes to first answer', 'Needs support with evidence language']
      },
      whiteboardData: {
        strokes: [
          {
            id: 'demo-stroke-1',
            color: '#6EE7B7',
            width: 5,
            points: [
              { x: 0.18, y: 0.24 },
              { x: 0.32, y: 0.33 },
              { x: 0.49, y: 0.27 },
              { x: 0.64, y: 0.41 }
            ]
          }
        ]
      },
      shareWhiteboardWithGuardian: false,
      layoutPrefs: {
        leftCollapsed: false,
        rightCollapsed: false,
        focusMode: false,
        activeNav: 'overview'
      }
    },
    materials: [
      {
        id: 'demo-activity-1',
        materialType: 'activity',
        title: 'Warm-up reflection',
        description: 'A quick confidence and strategy check before reading.',
        positionIndex: 0,
        config: {
          instructions: 'Ask the student how they know when they understand a passage and what feels tricky today.',
          blocks: [
            {
              id: 'prompt-1',
              type: 'prompt',
              copy: 'Start with a quick confidence check and one strategy the student already knows.'
            },
            {
              id: 'response-1',
              type: 'paragraph',
              label: 'Student reflection',
              model: 'studentReflection',
              placeholder: 'Type the student response or summary here.'
            },
            {
              id: 'coach-note-1',
              type: 'paragraph',
              label: 'Tutor note',
              model: 'tutorNote',
              placeholder: 'Capture the coaching move you want to try next.'
            }
          ],
          quickChecks: [
            { id: 'confidence', label: 'Confidence', scale: 5 },
            { id: 'accuracy', label: 'Accuracy', scale: 5 }
          ]
        }
      },
      {
        id: 'demo-link-1',
        materialType: 'link',
        title: 'Main idea anchor chart',
        description: 'Use this quick reference if the student needs a visual reminder.',
        externalUrl: 'https://example.com/main-idea-anchor',
        positionIndex: 1,
        config: {}
      }
    ],
    availableTemplates: [],
    duplicateCandidates: []
  });
}

export async function fetchInPersonPlan(sessionId) {
  if (!sessionId) return createDemoInPersonPayload();
  const response = await api.get(`/learning-class-sessions/sessions/${sessionId}/in-person-plan`, { skipGlobalLoading: true });
  return normalizePayload(response.data);
}

export async function saveInPersonPlan(sessionId, updates) {
  const response = await api.patch(`/learning-class-sessions/sessions/${sessionId}/in-person-plan`, updates, { skipGlobalLoading: true });
  return normalizePayload(response.data);
}

export async function duplicateInPersonPlan(sessionId, sourceSessionId) {
  const response = await api.post(
    `/learning-class-sessions/sessions/${sessionId}/in-person-plan/duplicate-from/${sourceSessionId}`,
    {},
    { skipGlobalLoading: true }
  );
  return normalizePayload(response.data);
}

export async function fetchInPersonMaterials(sessionId) {
  const response = await api.get(`/learning-class-sessions/sessions/${sessionId}/in-person-materials`, { skipGlobalLoading: true });
  return Array.isArray(response.data?.materials) ? response.data.materials.map(normalizeMaterial) : [];
}

export async function createInPersonMaterial(sessionId, material) {
  const response = await api.post(
    `/learning-class-sessions/sessions/${sessionId}/in-person-materials`,
    material,
    { skipGlobalLoading: true }
  );
  return normalizeMaterial(response.data?.material || {});
}

export async function uploadInPersonMaterial(sessionId, { file, materialType, title = '', description = '', config = {} }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('materialType', materialType);
  if (title) formData.append('title', title);
  if (description) formData.append('description', description);
  formData.append('config', JSON.stringify(config || {}));
  const response = await api.post(`/learning-class-sessions/sessions/${sessionId}/in-person-materials`, formData, {
    skipGlobalLoading: true
  });
  return normalizeMaterial(response.data?.material || {});
}

export async function updateInPersonMaterial(sessionId, materialId, updates) {
  const response = await api.patch(
    `/learning-class-sessions/sessions/${sessionId}/in-person-materials/${materialId}`,
    updates,
    { skipGlobalLoading: true }
  );
  return normalizeMaterial(response.data?.material || {});
}

export async function deleteInPersonMaterial(sessionId, materialId) {
  await api.delete(`/learning-class-sessions/sessions/${sessionId}/in-person-materials/${materialId}`, { skipGlobalLoading: true });
  return true;
}

export async function fetchInPersonMaterialResponse(sessionId, materialId, clientId = null) {
  const response = await api.get(`/learning-class-sessions/sessions/${sessionId}/in-person-materials/${materialId}/response`, {
    params: clientId ? { clientId } : undefined,
    skipGlobalLoading: true
  });
  return {
    clientId: response.data?.clientId || clientId || null,
    response: response.data?.response || { fieldValues: {}, status: 'draft' }
  };
}

export async function saveInPersonMaterialResponse(sessionId, materialId, { clientId, responseValues, status = 'draft' }) {
  const response = await api.put(
    `/learning-class-sessions/sessions/${sessionId}/in-person-materials/${materialId}/response`,
    {
      clientId,
      responseValues,
      status
    },
    { skipGlobalLoading: true }
  );
  return {
    clientId: response.data?.clientId || clientId || null,
    response: response.data?.response || { fieldValues: {}, status }
  };
}

export async function askInPersonAi(sessionId, { prompt, history = [], agentConfig = null }) {
  const response = await api.post(
    `/learning-class-sessions/sessions/${sessionId}/in-person-ai-assist`,
    {
      prompt,
      history,
      agentConfig
    },
    { skipGlobalLoading: true }
  );
  return {
    assistantText: String(response.data?.assistantText || '').trim(),
    runtime: response.data?.runtime || null
  };
}

export async function startInPersonSession(sessionId) {
  const response = await api.post(`/learning-class-sessions/sessions/${sessionId}/start`, {}, { skipGlobalLoading: true });
  return response.data?.session || null;
}

export async function endInPersonSession(sessionId, body = {}) {
  const response = await api.post(`/learning-class-sessions/sessions/${sessionId}/end`, body, { skipGlobalLoading: true });
  return response.data || {};
}

export function cloneInPersonPayload(payload) {
  return clone(payload);
}
