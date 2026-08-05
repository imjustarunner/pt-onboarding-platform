import { inject, ref } from 'vue';
import api from '../services/api.js';

/**
 * Static Spanish translations for meeting UI labels.
 * Keys are the English source strings; values are the Spanish equivalents.
 */
export const MEETING_ES = {
  // Header / controls
  'Enable transcription & attendance': 'Habilitar transcripción y asistencia',
  'Enabling…': 'Habilitando…',
  'Tools': 'Herramientas',
  'Copy join link': 'Copiar enlace de acceso',
  'Copied!': '¡Copiado!',
  'Add someone to this meeting': 'Agregar persona a esta reunión',
  'Session completed': 'Sesión completada',
  'Leave / End meeting': 'Salir / Finalizar reunión',
  'Leave meeting': 'Salir de la reunión',
  'Mark Completed & Close': 'Marcar completada y cerrar',
  'Leave without closing': 'Salir sin cerrar',
  'Cancel': 'Cancelar',
  'Retry': 'Reintentar',
  'Preparing meeting…': 'Preparando la reunión…',
  'waiting': 'esperando',
  'This meeting is being transcribed. Live speech may be captured and summarized for attendees with workspace access.':
    'Esta reunión está siendo transcrita. El discurso en vivo puede ser capturado y resumido para los asistentes con acceso al espacio de trabajo.',
  // Language toggle
  'Language': 'Idioma',
  'English': 'Inglés',
  // Chat panel
  'Chat': 'Chat',
  'Polls': 'Encuestas',
  'Q&A': 'Preguntas y respuestas',
  'No messages yet. Say hello.': 'Aún no hay mensajes. ¡Saluda!',
  'No polls yet. Create one above.': 'Aún no hay encuestas. Crea una arriba.',
  'No polls yet.': 'Aún no hay encuestas.',
  'No questions yet.': 'Aún no hay preguntas.',
  'Type a message…': 'Escribe un mensaje…',
  'Send': 'Enviar',
  'Photo ready to send': 'Foto lista para enviar',
  'Remove': 'Eliminar',
  'Poll question': 'Pregunta de encuesta',
  'Options (comma-separated)': 'Opciones (separadas por comas)',
  'Create poll': 'Crear encuesta',
  'Hide chat': 'Ocultar chat',
  'Chat & polls': 'Chat y encuestas',
  'Refresh': 'Actualizar',
  'One answer': 'Una respuesta',
  'Multiple answers': 'Múltiples respuestas',
  'Everyone answers': 'Todos responden',
  // Agenda
  'Agenda': 'Agenda',
  'Agenda items': 'Elementos de la agenda',
  'Status': 'Estado',
  '+ Add item': '+ Agregar elemento',
  'No agenda items yet.': 'Aún no hay elementos en la agenda.',
  'Live — updates for everyone': 'En vivo — actualizaciones para todos',
  'Loading agenda…': 'Cargando agenda…',
  // Goals / Actions
  'Goals': 'Metas',
  'Action Items': 'Elementos de acción',
  '+ Add goal': '+ Agregar meta',
  '+ Add action': '+ Agregar acción',
  'No goals yet.': 'Aún no hay metas.',
  'No action items yet.': 'Aún no hay elementos de acción.',
  'Loading goals and action items…': 'Cargando metas y elementos de acción…',
  'Save the meeting first, then you can add goals and action items.':
    'Guarda la reunión primero, luego podrás agregar metas y elementos de acción.',
  // Attendance
  'Attendance': 'Asistencia',
  'Participants': 'Participantes',
  'Copy names': 'Copiar nombres',
  'Copy with time': 'Copiar con tiempo',
  'In room': 'En sala',
  'Mandatory': 'Obligatorio',
  'Optional': 'Opcional',
  'Host': 'Anfitrión',
  'Muted': 'Silenciado',
  'Live participant list only — attendance time is not being tracked for this meeting.':
    'Solo lista de participantes en vivo — el tiempo de asistencia no se está rastreando.',
  'Session completed': 'Sesión completada',
  'segments': 'segmentos',
  'wait': 'espera',
};

/**
 * Translate a single UI string. Falls back to the original if no mapping exists.
 */
export function t(key, lang) {
  if (!lang || lang === 'en') return key;
  return MEETING_ES[key] ?? key;
}

/**
 * Returns the injected meeting language ref (default 'en').
 * Components inside JoinTeamMeetingView can call this to read lang.
 */
export function useMeetingLang() {
  return inject('meetingLang', ref('en'));
}

/**
 * Batch-translate an array of message texts via the backend AI translation service.
 * Returns a map of { originalText: translatedText }.
 * Skips empty strings and returns {} on any error.
 */
export async function batchTranslateMessages(texts, lang = 'es') {
  const valid = texts.filter((s) => typeof s === 'string' && s.trim());
  if (!valid.length || lang === 'en') return {};
  try {
    const { data } = await api.post('/public/translations/translate-strings', {
      strings: valid,
      lang
    });
    return data?.translations || {};
  } catch {
    return {};
  }
}
