const virtual = new Set(['TELEHEALTH', 'VIRTUAL', 'VIDEO', 'ONLINE']);

export function appointmentVideoRoomMode({ modality, businessType, videoRoomMode }) {
  if (virtual.has(String(modality).toUpperCase()) && !['learning', 'tutoring'].includes(String(businessType || '').toLowerCase())) return 'unique_session';
  return ['my_room', 'external'].includes(videoRoomMode) ? videoRoomMode : 'unique_session';
}
