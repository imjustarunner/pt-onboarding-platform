import base from './vitest.nlu-session-hub.config.js';
export default {...base,test:{...base.test,include:[
 'src/services/__tests__/scheduling.appointmentVideoPolicy.test.js',
 'src/services/__tests__/staffAppointmentMeet.test.js',
 'src/services/__tests__/scheduling.clinicalEdit.test.js',
 'src/services/__tests__/nluTutoringVideoChoice.test.js',
 'src/controllers/__tests__/nluTutoringVideoChoice.test.js',
 'src/services/__tests__/bookedTutoringRoom.test.js',
 'src/services/__tests__/bookedTutoringExternal.mysql.test.js',
 'src/services/__tests__/tutoringGuest.test.js',
 'src/services/__tests__/scheduling.sessionJoinEmail.test.js',
 'src/services/__tests__/scheduling.externalMeeting.test.js',
 'src/services/__tests__/tutoringNotePublication.test.js',
 'src/services/__tests__/tutoringAppointmentSettlement.test.js'
]}};
