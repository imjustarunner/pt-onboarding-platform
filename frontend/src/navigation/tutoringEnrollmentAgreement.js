// Published educational terms are shared by the form, validation and record copy.
// They do not change a booking's financial terms or grant portal/share access.
export const TUTORING_ENROLLMENT_VERSION='2026-11-13-v1';
export const TUTORING_MEDIA_KEY='tutoring_media_choice_2026_11_13';
export const TUTORING_SCHOOL_KEY='tutoring_school_choice_2026_11_13';
export function tutoringAgreementSections(locale='en') {
 const es=String(locale).startsWith('es');
 return es?[
  ['Servicios educativos','La tutoría apoya las materias, el nivel escolar y los objetivos indicados en esta inscripción. El formato, la duración y el horario se confirman al reservar. Esta solicitud no confirma una cita ni proporciona un diagnóstico o tratamiento clínico.'],
  ['Precios y pagos','Revise el precio y la modalidad de pago antes de reservar o comprar un paquete publicado. Puede hablar del pago con la oficina sin añadir una tarjeta. Inscribirse o firmar no cobra una tarjeta ni activa pagos recurrentes. Los términos y precios aceptados de citas o paquetes anteriores no cambian.'],
  ['Asistencia y cancelaciones','Avise con al menos 24 horas de anticipación cuando sea posible. Solo se aplican los cargos y excepciones de paquete que aceptó para esa reserva; esta inscripción no añade un cargo. Si el tutor cancela, no se cobra la sesión cancelada. Si ya pagó, contacte con la oficina para una reposición o el reembolso que corresponda según sus términos.'],
  ['Privacidad educativa','Guardamos los datos de inscripción, asistencia, planes, notas de aprendizaje y trabajos necesarios para el servicio. Cada persona accede solo a la información autorizada para ese estudiante y servicio. La información privada de otro familiar no se comparte por defecto. Solicite copias o correcciones a su equipo mediante el portal. La coordinación escolar requiere un permiso educativo separado.'],
  ['Sesiones virtuales','Use los enlaces de Next Level Up que aparecen en su portal. La grabación de audio/video y la transcripción no están activadas por esta inscripción ni por un permiso de fotografía. Para menores de 13 años, debe haber un adulto cerca y localizable.'],
  ['Sesiones presenciales','Revise la ubicación y el procedimiento de llegada en la cita. Indique las personas autorizadas para recoger al estudiante y las restricciones pertinentes. Recomendamos que un adulto autorizado permanezca en el lugar; no es un requisito general.'],
  ['Seguridad y conducta','Los tutores deben cumplir los requisitos de aprobación y revisión de antecedentes de la organización antes de trabajar de forma independiente con estudiantes. Use los canales aprobados de la agencia y comunique cualquier preocupación de seguridad. El personal sigue los requisitos aplicables de protección y notificación.'],
  ['Comunicación y permisos','Contacte a su tutor y al equipo desde el portal de Next Level Up. El correo y los textos se eligen por separado; una casilla de inscripción no activa mensajes SMS. Los permisos opcionales que siguen empiezan sin selección y no afectan a la tutoría. Solo firma por sí mismo y por los estudiantes para los que está autorizado.']
 ]:[
  ['Educational services','Tutoring supports the subjects, grade and learning goals listed in this enrollment. Format, duration and schedule are confirmed when booking. This request does not confirm an appointment or provide clinical diagnosis or treatment.'],
  ['Prices and payment','Review the quoted price and payment arrangement before booking or purchasing a published package. You may discuss payment with the office without adding a card. Enrollment or signing does not charge a card or enable recurring payments. Previously accepted appointment and purchased-package terms and prices remain unchanged.'],
  ['Attendance and cancellation','Please give at least 24 hours’ notice when possible. Only the fees and package exemptions you accepted for that booking apply; this enrollment adds no fee. A tutor-canceled session is not charged. If you prepaid, contact the office for a replacement or refund under your agreed terms.'],
  ['Education privacy','We retain enrollment details, attendance, learning plans, tutoring notes and work samples needed for the service. Each person may access only information authorized for that student and service. Another family member’s private information is not shared by default. Request copies or corrections from your team through the portal. School coordination requires a separate educational permission.'],
  ['Virtual sessions','Use the Next Level Up links in your portal. This enrollment and any photo release do not enable audio/video recording or transcription. For children under 13, an adult should be nearby and reachable.'],
  ['In-person sessions','Check the booked location and arrival instructions. Identify authorized pickup adults and relevant pickup restrictions. We recommend that an authorized adult stay on site; this is not a general requirement.'],
  ['Safety and conduct','Tutors must meet the organization’s approval and background-check requirements before independent student work. Use agency-approved communication channels and report safety concerns to your team. Staff follow applicable safeguarding and reporting requirements.'],
  ['Communication and permissions','Contact your tutor and team through the Next Level Up portal. Choose email and text updates separately; an enrollment checkbox does not activate SMS. The following optional permissions start unselected and do not affect tutoring. Each person signs only for themselves and students they are authorized to represent.']
 ];
}
export function tutoringOptionalReleaseSteps(locale='en') {
 const es=String(locale).startsWith('es');
 const option=(key,label)=>({key,id:key,type:'radio',required:false,label,options:[{value:'yes',label:es?'Sí, para los usos que selecciono':'Yes, for the uses I select'},{value:'no',label:es?'No doy permiso':'I do not give permission'}]});
 const conditional=(key,type,label,choice,extra={})=>({key,id:key,type,label,required:true,showIf:{fieldKey:choice,equals:'yes'},...extra});
 return [
  {id:'tutoring_optional_media_release',type:'questions',scope:'client',repeatPerClient:true,audience:'all',visibility:'always',label:es?'Permiso opcional de imagen':'Optional media permission',fields:[
   option(TUTORING_MEDIA_KEY,es?'¿Permite usar imágenes o trabajos de este estudiante para los fines que seleccione? Rechazar no afecta a la tutoría.':'May images or work from this student be used for the purposes you select? Declining does not affect tutoring.'),
   conditional('tutoring_media_private','checkbox',es?'Permito informes privados del programa para mi familia.':'I permit private program updates shared with my family.',TUTORING_MEDIA_KEY,{required:false}),
   conditional('tutoring_media_public','checkbox',es?'Permito el sitio web público y materiales promocionales de Next Level Up, sin el nombre completo ni datos de contacto.':'I permit the Next Level Up public website and promotional materials, without a full student name or contact details.',TUTORING_MEDIA_KEY,{required:false}),
   conditional('tutoring_media_signature','text',es?'Mi nombre como firma de este permiso de imagen':'My name as the signature for this media permission',TUTORING_MEDIA_KEY),
   conditional('tutoring_media_attestation','checkbox',es?'Confirmo los usos seleccionados. Puedo revocar usos futuros contactando al equipo en el portal. Este permiso no autoriza grabar sesiones.':'I confirm the selected uses. I may revoke future uses by contacting the team in the portal. This permission does not authorize session recording.',TUTORING_MEDIA_KEY)
  ]},
  {id:'tutoring_optional_school_release',type:'questions',scope:'client',repeatPerClient:true,audience:'all',visibility:'always',label:es?'Permiso opcional de coordinación escolar':'Optional school progress-sharing permission',fields:[
   option(TUTORING_SCHOOL_KEY,es?'¿Autoriza coordinación educativa con el contacto escolar que indique? Rechazar no afecta a la tutoría.':'Do you authorize educational coordination with the school contact you identify? Declining does not affect tutoring.'),
   conditional('tutoring_school_contact','text',es?'Nombre del docente o contacto':'Teacher or contact name',TUTORING_SCHOOL_KEY),
   conditional('tutoring_school_name','text',es?'Escuela':'School',TUTORING_SCHOOL_KEY),
   conditional('tutoring_school_email','text',es?'Correo del contacto escolar':'School contact email',TUTORING_SCHOOL_KEY),
   conditional('tutoring_school_information','textarea',es?'Información educativa que permite compartir (por ejemplo, objetivos, progreso o trabajos)':'Educational information you permit sharing (for example, goals, progress or work samples)',TUTORING_SCHOOL_KEY),
   conditional('tutoring_school_purpose','text',es?'Finalidad de la coordinación':'Purpose of coordination',TUTORING_SCHOOL_KEY),
   conditional('tutoring_school_expires','date',es?'Fecha de vencimiento':'Permission expiration date',TUTORING_SCHOOL_KEY),
   conditional('tutoring_school_signature','text',es?'Mi nombre como firma de este permiso escolar':'My name as the signature for this school permission',TUTORING_SCHOOL_KEY),
   conditional('tutoring_school_attestation','checkbox',es?'Autorizo solo la coordinación educativa descrita. Puedo revocar divulgaciones futuras contactando al equipo en el portal. No autoriza divulgar registros clínicos ni crear acceso al portal para la escuela.':'I authorize only the educational coordination described. I may revoke future disclosures by contacting the team in the portal. This does not authorize clinical disclosure or create school portal access.',TUTORING_SCHOOL_KEY)
  ]}
 ];
}
