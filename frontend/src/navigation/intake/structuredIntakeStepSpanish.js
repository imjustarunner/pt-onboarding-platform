import { OFFICE_INTAKE_ES } from './officeIntakeSpanish.js';
import { OFFICE_ENROLLMENT_UI_ES } from './officeEnrollmentUiSpanish.js';
import { OFFICE_SCREEN_ES } from './officeClinicalSpanish.js';

/**
 * Curated Spanish for structured intake steps (insurance, guardian waivers, communications).
 * Participant-facing copy when intakeLocale === 'es'. API translations fill any gaps.
 */

export const STRUCTURED_INTAKE_STEP_ES = {
  "Payment method choice": "Opción de método de pago",
  "Enter a card": "Ingresar una tarjeta",
  "Use Link (optional)": "Usar Link (opcional)",
  "Payment account email": "Correo de la cuenta de pago",
  "Click the Link button in the secure form to use your Link account. Stripe may ask you to enter or verify your email and a code after you choose Link. You can enter a card instead.": "Haga clic en el botón Link del formulario seguro para usar su cuenta de Link. Después de elegir Link, Stripe puede pedirle que ingrese o verifique su correo y un código. También puede ingresar una tarjeta.",
  "Link is optional. Choosing it does not connect a bank account or authorize recurring charges. Availability and account verification are handled by Stripe.": "Link es opcional. Elegirlo no conecta una cuenta bancaria ni autoriza cargos recurrentes. Stripe gestiona la disponibilidad y la verificación de la cuenta.",
  "Loading secure payment details…": "Cargando los datos de pago seguros…",
  "The secure payment form could not load.": "No se pudo cargar el formulario de pago seguro.",
  "The secure payment form is not ready.": "El formulario de pago seguro aún no está listo.",
  "Payment details changed. Review them before continuing.": "Los datos de pago cambiaron. Revíselos antes de continuar.",
  "Review insurance coverage before opening payment setup.": "Revise la cobertura del seguro antes de abrir la configuración de pago.",
  "A payment card is not requested for Medicaid coverage. Return to insurance review.": "No se solicita una tarjeta de pago para la cobertura de Medicaid. Regrese a la revisión del seguro.",
  "Existing coverage needs review before requesting a payment card.": "Debe revisar la cobertura existente antes de solicitar una tarjeta de pago.",
  "Enter and review primary and any secondary coverage before payment setup.": "Ingrese y revise la cobertura principal y cualquier cobertura secundaria antes de configurar el pago.",
  "Coverage changed. Confirm primary and any secondary coverage again before opening payment setup.": "La cobertura cambió. Vuelva a confirmar la cobertura principal y cualquier cobertura secundaria antes de abrir la configuración de pago.",
  "Secure card collection for this QA organization requires an isolated test-mode payment configuration.": "La recopilación segura de tarjetas para esta organización de prueba requiere una configuración de pago aislada en modo de prueba.",

  'Private answers': 'Respuestas privadas',
  'Please complete this page alone when possible. These answers stay private to clinical review and are not shown on shared review screens.': 'Complete esta página a solas cuando sea posible. Estas respuestas son privadas para la revisión clínica y no se muestran en las pantallas de revisión compartida.',
  'Client': 'Cliente',
  'Date of birth': 'Fecha de nacimiento',
  'Text messages (SMS)': 'Mensajes de texto (SMS)',
  'Program updates': 'Novedades del programa',
  'Terms of Use': 'Términos de uso',
  'Privacy Policy': 'Política de privacidad',
  'Initials': 'Iniciales',
  'Contact Phone': 'Teléfono de contacto',
  'Child Legal First': 'Nombre legal del niño',
  'Child Legal Last': 'Apellido legal del niño',
  'Child Dob': 'Fecha de nacimiento del niño',
  'Sex': 'Sexo',
  'Grade': 'Grado',
  'Each client must have their own Medicaid member ID.': 'Cada cliente debe tener su propio número de miembro de Medicaid.',
  'School communication notice': 'Aviso de comunicación escolar',
  'Your electronic signature below includes this school notice and your communication choices, even when you choose No texts.': 'Su firma electrónica a continuación incluye este aviso escolar y sus opciones de comunicación, incluso si elige no recibir mensajes de texto.',
  'Please click "Apply my signature to this authorization" to sign the Insurance Authorization at the bottom of this step.': 'Haga clic en «Aplicar mi firma a esta autorización» para firmar la autorización del seguro al final de este paso.',
  'Please sign the Insurance Authorization acknowledgment at the bottom of this step before continuing.': 'Firme el reconocimiento de la autorización del seguro al final de este paso antes de continuar.',
  'Please agree to and sign the insurance and payment authorization before completing enrollment.': 'Acepte y firme la autorización de seguro y pago antes de completar la inscripción.',
  'Please confirm coverage for every listed client.': 'Confirme la cobertura de cada cliente indicado.',
  'By typing my name and continuing, I electronically sign these choices. If I request texts, I control the listed phone and am the recipient. I can decline texts and still receive services.': 'Al escribir mi nombre y continuar, firmo electrónicamente estas opciones. Si solicito mensajes de texto, controlo el teléfono indicado y soy la persona destinataria. Puedo rechazar los mensajes de texto y seguir recibiendo servicios.',
  'A Yes saves your request. Texts start only after your phone, signed permission and the agency’s texting program are verified. A saved form does not override an earlier STOP.': 'Un Sí guarda su solicitud. Los mensajes comienzan solo después de verificar su teléfono, su autorización firmada y el programa de mensajes de la agencia. Guardar un formulario no anula una solicitud STOP anterior.',
  'Yes — scheduling + all program communications': 'Sí — programación y todas las comunicaciones del programa',
  'Yes — scheduling only': 'Sí — solo programación',
  'Essential messages only': 'Solo mensajes esenciales',
  'Yes — scheduling and appointment reminders': 'Sí — programación y recordatorios de citas',

  "Other Guardian Communication": "Comunicación con el otro tutor",
  "Insurance Info": "Información del seguro",
  "Primary": "Principal",
  "Secondary": "Secundario",
  "Insurer Name": "Nombre de la aseguradora",
  "Member Id": "Número de miembro",
  "Member ID": "Número de miembro",
  "Group Number": "Número de grupo",
  "Subscriber Name": "Nombre del titular",
  "Subscriber Dob": "Fecha de nacimiento del titular",
  "Subscriber Relationship": "Relación con el titular",
  "Has Secondary": "Tiene seguro secundario",
  "Self Pay": "Pago por cuenta propia",
  "Is Self Pay": "Pago por cuenta propia",
  "Payer Choice": "Forma de pago",
  "Recipient Phone": "Teléfono del destinatario",
  "Recipient phone": "Teléfono del destinatario",
  "Communication choices signed by": "Preferencias de comunicación firmadas por",
  "Choices signed at": "Fecha de firma de las preferencias",
  "Communication disclosure version": "Versión del aviso de comunicación",
  "Text reminder disclosure": "Aviso sobre recordatorios por texto",
  "School visit notifications": "Avisos de visitas en la escuela",
  "Routine phone calls": "Llamadas telefónicas habituales",
  "Automatic emails": "Correos automáticos",
  "Alternative contact instructions": "Instrucciones de contacto alternativas",
  "Provider / care-team texting": "Mensajes del profesional o equipo de atención",
  "Do not call": "No llamar",
  "Do not send": "No enviar",
  "Yes — email me": "Sí — enviarme correo electrónico",
  "No — do not email me": "No — no enviarme correo electrónico",
  "Yes — text me": "Sí — enviarme mensajes de texto",
  "No — do not text me": "No — no enviarme mensajes de texto",
  "Parent": "Padre o madre",
  "Guardian": "Tutor",
  "Student": "Estudiante",
  "student": "estudiante",
  "ROI All Active": "Autorización completa",
  "ROI (Speak)": "Autorización para hablar",
  "School ROI": "Autorización escolar para divulgar información",
  "Not answered": "Sin respuesta",
  "Signed document": "Documento firmado",
  "Signed by": "Firmado por",
  "Yes": "Sí",
  "Consent Summary": "Resumen del consentimiento",

  "physical_abuse": "¿La persona que recibe los servicios ha sufrido alguna vez daño físico o abuso?",
  "This document was electronically signed in compliance with the Electronic Signatures in Global and National Commerce Act (ESIGN Act), 15 U.S.C. § 7001 et seq. The signer consented to conduct this transaction electronically and was provided the required disclosures.": "Este documento fue firmado electrónicamente de conformidad con la Ley de Firmas Electrónicas en el Comercio Global y Nacional (Ley ESIGN), 15 U.S.C. § 7001 y siguientes. La persona firmante aceptó realizar esta transacción electrónicamente y recibió las divulgaciones requeridas.",

  "Press once to record this section. The same signature is reused. It does not need to be drawn again.": "Pulse una vez para registrar esta sección. Se reutiliza la misma firma; no necesita dibujarla de nuevo.",
  "Sign once below. Save & continue will apply this signature to each section.": "Firme una vez abajo. Guardar y continuar aplicará esta firma a cada sección.",
  "Apply my signature to every section": "Aplicar mi firma a todas las secciones",
  "Electronic signature": "Firma electrónica",
  "Type or draw once. Then apply that signature to each section, or apply it to every section at once.": "Escriba o dibuje su firma una vez. Luego aplíquela a cada sección o a todas las secciones a la vez.",
  "Uploading insurance cards securely… Please wait before leaving this step.": "Subiendo las tarjetas de seguro de forma segura… Espere antes de salir de este paso.",
  "Insurance card uploads saved securely.": "Las tarjetas de seguro se guardaron de forma segura.",
  "I have insurance": "Tengo seguro",
  "Thanks! We'll record this as self-pay. Insurance details stay closed.": "Gracias. Registraremos el pago por cuenta propia; no es necesario ingresar datos del seguro.",
  "I have insurance instead": "Prefiero usar mi seguro",
  "For visits at school, no appointment confirmation is needed. If your child will be absent or plans change, let our team know. A reply is reviewed by staff and does not automatically cancel a visit or create a fee. Continue to report absences to the school as usual. Your billing office may differ from the school where services take place.": "Las citas en la escuela no requieren confirmación. Si su hijo/a estará ausente o cambian los planes, avise a nuestro equipo. El personal revisa las respuestas; responder no cancela automáticamente una cita ni genera un cargo. Siga informando las ausencias a la escuela como de costumbre. La oficina de facturación puede ser distinta de la escuela donde se prestan los servicios.",
  "For visits at school, no appointment confirmation is needed. If you will be absent or plans change, let our team know. A reply is reviewed by staff and does not automatically cancel a visit or create a fee. Continue to report absences to the school as usual. Your billing office may differ from the school where services take place.": "Las citas en la escuela no requieren confirmación. Si estará ausente o cambian los planes, avise a nuestro equipo. El personal revisa las respuestas; responder no cancela automáticamente una cita ni genera un cargo. Siga informando las ausencias a la escuela como de costumbre. La oficina de facturación puede ser distinta de la escuela donde se prestan los servicios.",
  "Completed enrollment packet": "Paquete de inscripción completado",
  "For your records": "Para sus archivos",
  "Who this packet is for": "Personas incluidas en este paquete",
  "Parent / guardian": "Padre, madre o tutor",
  "Your information": "Su información",
  "Additional answers": "Respuestas adicionales",
  "Client details": "Datos del cliente",
  "Appointment reminder contacts": "Contactos para recordatorios de citas",
  "Guardian waivers & safety": "Autorizaciones del tutor y seguridad",
  "Preferred providers": "Profesionales preferidos",
  "Communication preferences": "Preferencias de comunicación",
  "Staff-assisted approval": "Aprobación con asistencia del personal",
  "Multi-child signature consent": "Consentimiento de firma para varios hijos",
  "Acknowledgments": "Reconocimientos",
  "Electronic Signature Certificate": "Certificado de firma electrónica",
  "Signatures": "Firmas",
  "Acknowledged and signed electronically": "Reconocido y firmado electrónicamente",
  "Signature captured electronically.": "Firma registrada electrónicamente.",
  "Print this packet": "Imprimir este paquete",
  "View this version": "Ver esta versión",
  "Signed document": "Documento firmado",
  "Signer": "Firmante",
  "Signer email": "Correo electrónico del firmante",
  "Role": "Función",
  "ESIGN consent given": "Consentimiento para firma electrónica otorgado",
  "Submitted": "Enviado",
  "Submission ID": "Número de envío",
  "IP address": "Dirección IP",
  "Device / browser": "Dispositivo / navegador",
  "Documents signed": "Documentos firmados",
  "Relationship to client": "Parentesco con el cliente",
  "This is for": "Esta inscripción es para",
  "Selected": "Seleccionados",
  "Mode": "Modalidad",
  "Staff last name": "Apellido del personal",
  "Client first name": "Nombre del cliente",
  "Approved at": "Fecha de aprobación",
  "Agreement": "Acuerdo",
  "Accepted at": "Fecha de aceptación",
  "Dependents": "Dependientes",
  "Acknowledged": "Reconocido",
  "School Release of Information": "Autorización escolar para divulgar información",
  "Disclosure Statement": "Declaración de divulgación",
  "Informed Consent for Treatment and Group Counseling": "Consentimiento informado para tratamiento y consejería grupal",
  "Policy and Services Agreement": "Acuerdo de políticas y servicios",
  "HIPAA Privacy Policy and Notice of Privacy Practices": "Política de privacidad HIPAA y aviso de prácticas de privacidad",
  "This branded packet is your copy of what you submitted, including answers, signatures, approvals, and electronic signature details. Signed legal form copies may also be emailed when they are ready. Keep this file private.": "Este paquete es su copia de la información enviada, incluidas las respuestas, firmas, aprobaciones y datos de firma electrónica. También se pueden enviar por correo electrónico las copias de los documentos legales firmados cuando estén listas. Mantenga este archivo privado.",
  "This is your branded copy — answers, signatures, approvals, and e-sign details. Keep it private.": "Esta es su copia de las respuestas, firmas, aprobaciones y datos de firma electrónica. Manténgala privada.",

  'Questions': 'Preguntas',
  'PSC-17 complete': 'PSC-17 completo',
  'PSC-17 started': 'PSC-17 iniciado',
  'How will services be paid?': '¿Cómo se pagarán los servicios?',
  'Insurance Information': 'Información del seguro',
  'Your ID choice is saved. Continue to review and submit the enrollment.': 'Su elección de identificación está guardada. Continúe para revisar y enviar la inscripción.',
  'Our office will review your insurance and confirm benefits.': 'Nuestra oficina revisará su seguro y confirmará los beneficios.',
  'View signed ROI': 'Ver la autorización firmada',
  'View signed release': 'Ver la autorización firmada',
  'End session': 'Finalizar sesión',
  'Download per-child packets': 'Descargar los paquetes de cada hijo/a',
  'Download per-client releases': 'Descargar las autorizaciones de cada cliente',
  'Download': 'Descargar',
  'PDF still preparing': 'El PDF se está preparando',
  'PDF still preparing — we’ll email it.': 'El PDF se está preparando; lo enviaremos por correo electrónico.',
  'Your signed release is saved. View or download your copy below.': 'Su autorización firmada está guardada. Vea o descargue su copia abajo.',

  'Finish entering your primary insurance and any secondary coverage, then confirm below.': 'Termine de ingresar su seguro principal y cualquier cobertura secundaria; luego confirme abajo.',
  'Confirm primary and any secondary coverage': 'Confirmar el seguro principal y cualquier cobertura secundaria',
  'Enter the insurer for your primary and any secondary coverage before confirming.': 'Ingrese la aseguradora de su seguro principal y de cualquier cobertura secundaria antes de confirmar.',
  'Please confirm your primary and any secondary coverage.': 'Confirme su seguro principal y cualquier cobertura secundaria.',

  'Payment method': 'Método de pago',
  'You can save a card now or add one later in your portal. Saving a card does not charge it.': 'Puede guardar una tarjeta ahora o agregarla más tarde en su portal. Guardar una tarjeta no genera un cobro.',
  'Checking secure card availability…': 'Verificando la disponibilidad del registro seguro de tarjetas…',
  'Add card now': 'Agregar tarjeta ahora',
  'Add card later': 'Agregar tarjeta más tarde',
  'Card collection is unavailable right now. You can continue enrollment and arrange payment with the office later.': 'El registro de tarjetas no está disponible en este momento. Puede continuar la inscripción y coordinar el pago con la oficina más tarde.',
  'No card will be saved now. Add one in your portal before paid services begin, or contact the office about payment arrangements.': 'No se guardará ninguna tarjeta ahora. Agregue una en su portal antes de comenzar los servicios de pago o comuníquese con la oficina para coordinar el pago.',

  'Continue with payment follow-up': 'Continuar con seguimiento de pago',
  'Secure card collection is not enabled yet. Your account will need payment follow-up before paid services.': 'El registro seguro de tarjetas aún no está habilitado. Se necesitará un seguimiento de pago antes de recibir servicios de pago.',
  'Client’s relationship to subscriber': 'Relación del cliente con el titular',
  'Select': 'Seleccione', 'Self': 'Yo mismo', 'Child': 'Hijo/a', 'Spouse': 'Cónyuge',
  'Insurance carrier': 'Compañía de seguros',
  'Electronic payer ID (if known)': 'ID electrónico del pagador (si lo conoce)',
  'Eligibility payer ID (if different)': 'ID del pagador para verificar cobertura (si es diferente)',
  'Group number': 'Número de grupo', 'Patient/member suffix': 'Sufijo del paciente/miembro',
  'Subscriber legal first name': 'Nombre legal del titular', 'Subscriber legal last name': 'Apellido legal del titular',
  'Subscriber date of birth': 'Fecha de nacimiento del titular', 'Subscriber address': 'Dirección del titular',
  'Apartment / suite': 'Apartamento / oficina', 'City': 'Ciudad', 'State': 'Estado', 'ZIP code': 'Código postal',
  'Plan type': 'Tipo de plan', 'Coverage effective date': 'Fecha de inicio de la cobertura',
  'Coverage end date (if applicable)': 'Fecha de fin de la cobertura (si corresponde)', 'Claims phone': 'Teléfono para reclamaciones',
  'Subscriber sex on policy': 'Sexo del titular según la póliza',
  'Medicaid (each client has a separate member ID)': 'Medicaid (cada cliente tiene su propio ID de miembro)',
  'Subscriber is the client. Name, birth date, sex and address use the client identity above; no duplicate entry is needed.': 'El titular es el cliente. Se usan el nombre, la fecha de nacimiento, el sexo y la dirección indicados arriba; no es necesario ingresarlos otra vez.',
  'Please agree to the authorization statements to continue.': 'Acepte las declaraciones de autorización para continuar.',
  'Please type your full name as a signature.': 'Escriba su nombre completo como firma.',
  // ── Communications ───────────────────────────────────────────────────────
  'Choose how you would like to receive operational communications. You can update these preferences at any time.':
    'Elija cómo desea recibir comunicaciones operativas. Puede actualizar estas preferencias en cualquier momento.',
  'Choose how you would like to receive platform communications. You can update these preferences at any time.':
    'Elija cómo desea recibir comunicaciones de la plataforma. Puede actualizar estas preferencias en cualquier momento.',
  'Email Notifications Preference': 'Preferencia de notificaciones por correo electrónico',
  'Email Communication Preference': 'Preferencia de comunicación por correo electrónico',
  'Text Message (SMS) Communication Preference': 'Preferencia de comunicación por mensaje de texto (SMS)',
  'Please choose what you would like to receive by email from us. If you opt in, we may email you about operational scheduling, internal announcements, and optional platform participation updates. Your email will never be shared or sold to third parties, and you may unsubscribe at any time.':
    'Elija lo que desea recibir por correo electrónico. Si acepta, podemos enviarle correos sobre programación operativa, anuncios internos y actualizaciones opcionales de participación en la plataforma. Su correo nunca se compartirá ni venderá a terceros, y puede cancelar la suscripción en cualquier momento.',
  'Please choose what you would like to receive emails from us. If you opt in, we may email you about scheduling, appointment reminders, and-if selected-updates about mental health programs and services. Your email will never be shared or sold to third parties, and you may unsubscribe at any time.':
    'Elija lo que desea recibir por correo electrónico. Si acepta, podemos enviarle correos sobre programación, recordatorios de citas y —si lo selecciona— actualizaciones sobre programas y servicios de salud mental. Su correo nunca se compartirá ni venderá a terceros, y puede cancelar la suscripción en cualquier momento.',
  'Yes - Operational scheduling + internal announcements': 'Sí — Programación operativa + anuncios internos',
  'Yes - Scheduling + all program communications': 'Sí — Programación + todas las comunicaciones del programa',
  'Yes - Scheduling only': 'Sí — Solo programación',
  'Yes - Scheduling and appointment reminders': 'Sí — Programación y recordatorios de citas',
  'No - Do not text me': 'No — No me envíen mensajes de texto',
  'SMS With Your Provider/Care Team': 'SMS con su proveedor / equipo de atención',
  'If you choose Yes, you consent to receive service-related text messages through PlotTwistHQ from':
    'Si elige Sí, usted consiente recibir mensajes de texto relacionados con el servicio a través de PlotTwistHQ de parte de',
  'follow-up, coordination, and service-related responses). These messages are HIPAA-protected and associated with your care relationship at':
    'seguimiento, coordinación y respuestas relacionadas con el servicio). Estos mensajes están protegidos por HIPAA y asociados con su relación de atención en',
  'By selecting': 'Al seleccionar',
  'and opting in, you understand and agree to the following:':
    'y aceptar, usted entiende y acepta lo siguiente:',
  'These messages may be viewed by the care team associated with your provider.':
    'Estos mensajes pueden ser vistos por el equipo de atención asociado con su proveedor.',
  'Your provider and our care team are not available for emergencies, and these messages are not monitored in real time. In case of emergency, call 911.':
    'Su proveedor y nuestro equipo de atención no están disponibles para emergencias, y estos mensajes no se monitorean en tiempo real. En caso de emergencia, llame al 911.',
  'Your provider will not receive messages outside of their working hours. All messages are confidentially stored within the platform.':
    'Su proveedor no recibirá mensajes fuera de su horario laboral. Todos los mensajes se almacenan de forma confidencial en la plataforma.',
  'PlotTwistHQ is not responsible for, nor independently aware of, the content of direct communications between you and your provider.':
    'PlotTwistHQ no es responsable ni tiene conocimiento independiente del contenido de las comunicaciones directas entre usted y su proveedor.',
  'You agree not to share confidential third-party information in these messages, and understand that this communication channel does not replace nor constitute clinical care or a therapeutic relationship.':
    'Usted acepta no compartir información confidencial de terceros en estos mensajes y entiende que este canal de comunicación no reemplaza ni constituye atención clínica ni una relación terapéutica.',
  'Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help. Appointment reminders/confirmations are not sent from individual provider numbers. Additional terms apply —':
    'La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para cancelar en cualquier momento. Responda HELP para ayuda. Los recordatorios/confirmaciones de citas no se envían desde números individuales de proveedores. Se aplican términos adicionales —',
  'Terms:': 'Términos:',
  'Privacy:': 'Privacidad:',
  'Yes - I opt in to provider/care-team texting and agree to the terms above':
    'Sí — Acepto mensajes de texto con mi proveedor/equipo de atención y acepto los términos anteriores',
  'No - Keep provider texting off': 'No — Mantener desactivados los mensajes del proveedor',
  'Please note:':
    'Tenga en cuenta:',
  'Your provider/care team sends these messages through PlotTwistHQ, and you receive/reply to them as standard SMS messages on your phone. If you choose to respond to or initiate a text message with your provider or care team via SMS, you acknowledge and agree that the same terms and conditions outlined above apply to that exchange. Additional terms are always available at':
    'Su proveedor/equipo de atención envía estos mensajes a través de PlotTwistHQ, y usted los recibe/responde como mensajes SMS estándar en su teléfono. Si elige responder o iniciar un mensaje de texto con su proveedor o equipo de atención por SMS, usted reconoce y acepta que los mismos términos y condiciones descritos anteriormente se aplican a ese intercambio. Los términos adicionales están siempre disponibles en',
  'and': 'y',
  'Optional Program & Service Updates': 'Actualizaciones opcionales de programas y servicios',
  'If you choose Yes,': 'Si elige Sí,',
  'may send optional SMS updates through PlotTwistHQ about this agency\'s programs and services (for example, openings, enrollment options, and availability). You may also receive limited updates about relevant affiliate services. Affiliates never receive access to your personal or clinical information through this update channel, and any affiliate program requires its own separate opt-in for communication and registration. Message frequency varies (no more than twice per month). Message and data rates may apply. Reply STOP to unsubscribe. Reply HELP for help.':
    'puede enviar actualizaciones opcionales por SMS a través de PlotTwistHQ sobre los programas y servicios de esta agencia (por ejemplo, vacantes, opciones de inscripción y disponibilidad). También puede recibir actualizaciones limitadas sobre servicios afiliados relevantes. Los afiliados nunca reciben acceso a su información personal o clínica a través de este canal de actualizaciones, y cualquier programa afiliado requiere su propia aceptación separada para comunicación e inscripción. La frecuencia de los mensajes varía (no más de dos veces al mes). Pueden aplicarse tarifas de mensajes y datos. Responda STOP para cancelar. Responda HELP para ayuda.',
  'Yes - I want optional updates': 'Sí — Deseo actualizaciones opcionales',
  'No - Keep optional updates off': 'No — Mantener desactivadas las actualizaciones opcionales',
  'Internal Workforce + School Staff Notifications (Opt-In)':
    'Notificaciones internas para personal y personal escolar (opcional)',
  'By opting in, you agree to receive SMS/text messages from':
    'Al aceptar, usted acepta recibir mensajes SMS/texto de',
  'through PlotTwistHQ for operational notifications and reminders, internal announcements, and optional polls/voting related to your participation on the platform. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help. Support: 833-756-8894 ext. 701 | hq@plottwistco.com.':
    'a través de PlotTwistHQ para notificaciones y recordatorios operativos, anuncios internos y encuestas/votaciones opcionales relacionadas con su participación en la plataforma. La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para cancelar en cualquier momento. Responda HELP para ayuda. Soporte: 833-756-8894 ext. 701 | hq@plottwistco.com.',
  'Yes - I opt in to internal workforce / school staff SMS notifications':
    'Sí — Acepto notificaciones SMS internas para personal / personal escolar',
  'No - Keep internal notifications off': 'No — Mantener desactivadas las notificaciones internas',
  '{tenant} utilizes PlotTwistHQ, a platform by PlotTwistCo (PTCo), to facilitate appointment scheduling, reminders, and related communication. All messages you receive are scheduled, coordinated, and established directly by {tenant} — you will never receive any communications from PlotTwistCo (PTCo) directly. Please select your preference for receiving text messages. If you opt in, you may receive messages related to scheduling and appointment reminders. Message frequency varies; typically 7 days before and 24 hours before your appointment. You may be asked to reply with Yes or No regarding your attendance. Message and data rates may apply. Reply STOP to unsubscribe. Reply HELP for help.':
    '{tenant} utiliza PlotTwistHQ, una plataforma de PlotTwistCo (PTCo), para facilitar la programación de citas, recordatorios y comunicación relacionada. Todos los mensajes que reciba son programados, coordinados y establecidos directamente por {tenant} — nunca recibirá comunicaciones de PlotTwistCo (PTCo) directamente. Seleccione su preferencia para recibir mensajes de texto. Si acepta, puede recibir mensajes relacionados con la programación y recordatorios de citas. La frecuencia varía; normalmente 7 días antes y 24 horas antes de su cita. Se le puede pedir que responda Sí o No sobre su asistencia. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para cancelar. Responda HELP para ayuda.',
  'Please choose an email communication preference.': 'Elija una preferencia de comunicación por correo electrónico.',
  'Please choose an SMS communication preference.': 'Elija una preferencia de comunicación por SMS.',
  'Please choose whether to enable provider/care-team texting.': 'Elija si desea activar mensajes de texto con su proveedor/equipo de atención.',
  'Please choose whether to enable optional program updates.': 'Elija si desea activar actualizaciones opcionales de programas.',
  'Please choose whether to enable internal workforce notifications.': 'Elija si desea activar notificaciones internas del personal.',
  'Save preferences & continue': 'Guardar preferencias y continuar',

  // ── Guardian waiver — section titles & blurbs ────────────────────────────
  'Pickup authorization': 'Autorización de recogida',
  'Walk-home authorization': 'Autorización para ir a casa caminando',
  'Emergency contacts': 'Contactos de emergencia',
  'Medical information & allergies': 'Información médica y alergias',
  'Meals': 'Comidas',
  'Use this section ONLY if you authorize your child to walk home alone after this program.':
    'Use esta sección SOLO si autoriza a su hijo/a a ir a casa caminando solo/a después de este programa.',
  'People we may contact if we cannot reach you.':
    'Personas a las que podemos contactar si no podemos comunicarnos con usted.',
  'This program does not provide meals. Please plan to bring your own lunch or snacks as needed.':
    'Este programa no proporciona comidas. Planee traer su propio almuerzo o refrigerios según sea necesario.',

  // ── Guardian waiver — step chrome ────────────────────────────────────────
  Signed: 'Firmado',
  'Sign again': 'Firmar de nuevo',
  'Apply my signature to this section': 'Aplicar mi firma a esta sección',
  'You must apply your signature here to record this waiver — it will be re-used from the signature you drew earlier.':
    'Debe aplicar su firma aquí para registrar esta autorización — se reutilizará la firma que dibujó anteriormente.',
  'Complete the earlier signature step to sign waivers.':
    'Complete el paso de firma anterior para firmar las autorizaciones.',
  ' by ': ' por ',
  'e-Signature applied': 'Firma electrónica aplicada',
  'source:': 'origen:',
  'reused signature drawn earlier in this session':
    'firma reutilizada dibujada antes en esta sesión',
  'newly drawn for this section': 'dibujada nuevamente para esta sección',
  'just now': 'ahora mismo',
  'Copy pickup contacts from': 'Copiar contactos de recogida de',
  'Copy emergency contacts from': 'Copiar contactos de emergencia de',
  'pickup contacts': 'contactos de recogida',
  'emergency contacts': 'contactos de emergencia',
  'this section': 'esta sección',
  ' by ': ' por ',
  Child: 'Niño/a',

  // ── Pickup authorization fields ────────────────────────────────────────
  'We cannot release your child to individuals who are not approved in writing and never to an individual under the age of 18.':
    'No podemos entregar a su hijo/a a personas que no estén aprobadas por escrito y nunca a una persona menor de 18 años.',
  'At any time you may update or submit additional individuals, though we request that you list any individuals whom you approve at the time of admission likely to be included to help our staff manage check out and release for these programs.':
    'En cualquier momento puede actualizar o enviar personas adicionales; le pedimos que incluya a quienes apruebe al momento de la admisión para ayudar a nuestro personal a gestionar la salida y entrega en estos programas.',
  'I do not want to list additional pickup contacts at this time.':
    'No deseo incluir contactos adicionales de recogida en este momento.',
  'Full name': 'Nombre completo',
  Relationship: 'Parentesco',
  'Phone (10 digits)': 'Teléfono (10 dígitos)',
  Remove: 'Eliminar',
  'Add person': 'Agregar persona',
  'Please enter a real 10-digit phone number for {contact} (we\'ll need to call them at check-out time).':
    'Ingrese un número de teléfono real de 10 dígitos para {contact} (necesitaremos llamarles a la hora de salida).',

  // ── Emergency contacts fields ────────────────────────────────────────────
  'Edit any contact below, or add/remove entries. Saving will replace the current list.':
    'Edite cualquier contacto abajo o agregue/elimine entradas. Al guardar se reemplazará la lista actual.',
  'I do not want to list emergency contacts at this time.':
    'No deseo incluir contactos de emergencia en este momento.',
  Name: 'Nombre',
  'Phone * (10 digits)': 'Teléfono * (10 dígitos)',
  'Add contact': 'Agregar contacto',
  'this contact': 'este contacto',
  'Please enter a real 10-digit phone number for {contact} (we\'ll need to call them in an emergency).':
    'Ingrese un número de teléfono real de 10 dígitos para {contact} (necesitaremos llamarles en una emergencia).',

  // ── Walk-home authorization ──────────────────────────────────────────────
  'We do not release children to walk home alone unless a parent or legal guardian has explicitly authorized it in writing for this program. By signing this section, you assume responsibility for your child\'s transportation home and agree that program staff are released from supervisory duty as soon as your child leaves the program at the time(s) below.':
    'No autorizamos que los niños vayan a casa caminando solos a menos que un padre o tutor legal lo haya autorizado explícitamente por escrito para este programa. Al firmar esta sección, usted asume la responsabilidad del transporte a casa de su hijo/a y acepta que el personal del programa queda liberado de la supervisión en cuanto su hijo/a salga del programa en el(los) horario(s) indicados abajo.',
  'If you do not want your child to walk home alone, leave this section un-authorized and complete the Pickup authorization section instead.':
    'Si no desea que su hijo/a vaya a casa caminando solo/a, deje esta sección sin autorizar y complete la sección de Autorización de recogida.',
  'I do NOT authorize': 'NO autorizo',
  'my child to walk home alone from this program. (Use the Pickup authorization section.)':
    'a que mi hijo/a vaya a casa caminando solo/a desde este programa. (Use la sección de Autorización de recogida.)',
  'I authorize my child to walk home alone after this program ends.':
    'Autorizo a que mi hijo/a vaya a casa caminando solo/a cuando termine este programa.',
  'Please complete the highlighted fields below.': 'Complete los campos resaltados abajo.',
  'Approved release window': 'Ventana de salida autorizada',
  'Route or destination': 'Ruta o destino',
  '(optional but recommended)': '(opcional pero recomendado)',
  'e.g. Monday–Friday after 3:30 pm': 'ej., lunes a viernes después de las 3:30 p. m.',
  'e.g. Walks west on Main St to home — about 4 blocks':
    'ej., Camina hacia el oeste por Main St hasta casa — unas 4 cuadras',
  'Conditions (weather, daylight, escort by older sibling, etc.)':
    'Condiciones (clima, luz del día, acompañamiento de hermano mayor, etc.)',
  'Optional — note any conditions under which your child should NOT walk home (we\'ll call you instead).':
    'Opcional — indique condiciones bajo las cuales su hijo/a NO debe ir caminando (le llamaremos en su lugar).',
  'I confirm I am the parent or legal guardian and I assume responsibility for my child once they are released to walk home at the time(s) above. I understand program staff are released from supervisory duty at that point.':
    'Confirmo que soy el padre, madre o tutor legal y asumo la responsabilidad de mi hijo/a una vez que sea liberado/a para ir caminando en el(los) horario(s) indicados arriba. Entiendo que el personal del programa queda liberado de la supervisión en ese momento.',

  // ── Allergies / snacks ───────────────────────────────────────────────────
  'This form provides your facilitating partner the necessary medical information for your participating child/dependent.':
    'Este formulario proporciona a su socio facilitador la información médica necesaria sobre su hijo/a o dependiente participante.',
  'We do not administer any medication and special instructions or plans will need to be put in place for you to administer, or provide an alternative individual permission to administer any medications during the sessions and activities. Please detail below if you require special accommodations to schedule time to administer medications.':
    'No administramos medicamentos; se deberán establecer instrucciones o planes especiales para que usted administre medicamentos, o para autorizar a otra persona durante las sesiones y actividades. Detalle abajo si necesita adaptaciones especiales para programar la administración de medicamentos.',
  'We do not have a nurse on staff, though we will have first aid kits available for minor incidents.':
    'No contamos con enfermera/o en el personal, aunque tendremos botiquines de primeros auxilios para incidentes menores.',
  'No medical info to report': 'No hay información médica que reportar',
  '— fill every field below with "None"': '— completar todos los campos abajo con "Ninguno"',
  'Allergies / medical notes': 'Alergias / notas médicas',
  'List any known allergies, dietary restrictions, or medical conditions staff should be aware of.':
    'Indique alergias conocidas, restricciones dietéticas o condiciones médicas que el personal deba conocer.',
  'Approved snacks': 'Refrigerios aprobados',
  'Select all snacks you approve for your child': 'Seleccione todos los refrigerios que aprueba para su hijo/a',
  'All of the above': 'Todos los anteriores',
  'My child should not have any snacks / please hold':
    'Mi hijo/a no debe recibir refrigerios / por favor abstenerse',
  '— fill every field below with "None"': '— completar todos los campos abajo con "Ninguno"',
  'No snacks approved.': 'No se aprobaron refrigerios.',
  'All listed snacks approved.': 'Todos los refrigerios listados aprobados.',
  'Approved:': 'Aprobados:',
  'Additional snack notes or restrictions (optional)': 'Notas o restricciones adicionales sobre refrigerios (opcional)',
  'Any other snack notes, e.g. nut-free only, no red dye…':
    'Cualquier otra nota sobre refrigerios, p. ej., solo sin nueces, sin colorante rojo…',
  'List snacks your child may have, or write \'none\' if no snacks.':
    'Liste los refrigerios que su hijo/a puede tener, o escriba "ninguno" si no hay refrigerios.',
  'Other medical notes': 'Otras notas médicas',
  'Any additional information staff should know.':
    'Cualquier información adicional que el personal deba conocer.',

  // ── Meals preferences ────────────────────────────────────────────────────
  'Meals / foods you approve': 'Comidas / alimentos que aprueba',
  'Meals / foods to avoid': 'Comidas / alimentos a evitar',
  Notes: 'Notas',

  // ── Guardian waiver validation (parent step) ─────────────────────────────
  'Missing waiver data. Please refresh and try again.':
    'Faltan datos de autorización. Actualice la página e intente de nuevo.',
  'Please enter a real 10-digit phone number for every pickup contact you list for {label} (we\'ll need to call them at check-out time).':
    'Ingrese un número de teléfono real de 10 dígitos para cada contacto de recogida que liste para {label} (necesitaremos llamarles a la hora de salida).',
  'Required — describe when your child is approved to walk home.':
    'Obligatorio — describa cuándo su hijo/a está autorizado/a a ir caminando a casa.',
  'Please check the attestation box to confirm you authorize this.':
    'Marque la casilla de confirmación para autorizar esto.',
  'Please complete the walk-home authorization details for {label}, or change your selection to "I do NOT authorize."':
    'Complete los detalles de autorización para ir caminando de {label}, o cambie su selección a "NO autorizo".',
  'Please add at least one emergency contact for {label}, or check "I do not want to list emergency contacts at this time."':
    'Agregue al menos un contacto de emergencia para {label}, o marque "No deseo incluir contactos de emergencia en este momento."',
  'Phone number is required for each emergency contact you list for {label}.':
    'Se requiere número de teléfono para cada contacto de emergencia que liste para {label}.',
  'Please enter a real 10-digit phone number for every emergency contact you list for {label} (we\'ll need to call them in an emergency).':
    'Ingrese un número de teléfono real de 10 dígitos para cada contacto de emergencia que liste para {label} (necesitaremos llamarles en una emergencia).',
  'Please complete medical/allergy information for {label}, or check "No medical info to report."':
    'Complete la información médica/de alergias para {label}, o marque "No hay información médica que reportar."',
  'Please apply your signature to every waiver section for {label} before continuing.':
    'Aplique su firma a cada sección de autorización para {label} antes de continuar.',
  'Required — describe when your child is approved to walk home.':
    'Obligatorio — describa cuándo su hijo/a está autorizado/a a ir caminando a casa.',
  'Please check the attestation box to confirm you authorize this.':
    'Marque la casilla de confirmación para autorizar esto.',
  'Required — type "None" if not applicable.': 'Obligatorio — escriba "Ninguno" si no aplica.',
  'Please complete allergies, approved snacks, and notes for {label} (use the "No medical info to report" checkbox if none).':
    'Complete alergias, refrigerios aprobados y notas para {label} (use la casilla "No hay información médica que reportar" si no hay ninguna).',

  // ── Insurance (subset — rest filled by API batch) ────────────────────────
  'I am self-pay': 'Yo pago directamente (sin seguro)',
  '— I don\'t have insurance to bill, or I prefer to pay out of pocket.':
    '— No tengo seguro para facturar, o prefiero pagar de mi bolsillo.',
  'Thanks! We\'ll record this as self-pay. You can skip the insurance carrier / member ID fields below and proceed to sign the authorization at the bottom of this page.':
    '¡Gracias! Registraremos esto como pago directo. Puede omitir los campos de aseguradora / ID de miembro abajo y proceder a firmar la autorización al final de esta página.',
  'Primary Insurance': 'Seguro primario',
  'Secondary Insurance': 'Seguro secundario',
  'Start by uploading your insurance card images. We will auto-fill what we can, and you can edit anything below.':
    'Comience subiendo las imágenes de su tarjeta de seguro. Completaremos automáticamente lo que podamos, y puede editar cualquier dato abajo.',
  'Insurance Carrier Name': 'Nombre de la aseguradora',
  'Start typing to search (e.g. Health First Colorado, Aetna…)':
    'Comience a escribir para buscar (p. ej., Health First Colorado, Aetna…)',
  'Start typing to search…': 'Comience a escribir para buscar…',
  '✓ Medicaid detected — no self-pay cost applies for this program.':
    '✓ Medicaid detectado — no aplica costo de pago directo para este programa.',
  'If the child has other primary insurance, list that other plan as Primary and add Medicaid under Secondary.':
    'Si el niño/a tiene otro seguro primario, indíquelo como Primario y agregue Medicaid como Secundario.',
  'Use My Name': 'Usar mi nombre',
  'Use Guardian Name': 'Usar nombre del tutor',
  'Use Client 1 Name': 'Usar nombre del cliente 1',
  'Use {name}': 'Usar el nombre de {name}',
  'Insurance card – front': 'Tarjeta de seguro – frente',
  'Insurance card – back': 'Tarjeta de seguro – reverso',
  'Tap to take photo or upload': 'Toque para tomar foto o subir',
  'Tap to upload': 'Toque para subir',
  'I do not have my primary insurance card right now':
    'No tengo mi tarjeta de seguro primario en este momento',
  'Subscriber Name': 'Nombre del titular',
  'Child name': 'Nombre del niño/a',
  'Parent / Guardian name': 'Nombre del padre/madre o tutor',
  'For Medicaid-only coverage, this is usually the child.':
    'Para cobertura solo Medicaid, normalmente es el niño/a.',
  'For private/commercial plans, this is usually the parent/guardian policy holder.':
    'Para planes privados/comerciales, normalmente es el titular padre/madre o tutor.',
  'Subscriber ID / Member ID': 'ID del titular / ID de miembro',
  'For Medicaid plans, Member ID is recommended but not required.':
    'Para planes Medicaid, el ID de miembro se recomienda pero no es obligatorio.',
  'Group number (if applicable)': 'Número de grupo (si aplica)',
  'Group number': 'Número de grupo',
  'Patient suffix': 'Sufijo del paciente',
  Optional: 'Opcional',
  'How did you hear about the agency? (Optional)': '¿Cómo se enteró de la agencia? (Opcional)',
  'For example: an event, an online search, social media, a friend, or a referral. If it was an event, please include its name.':
    'Por ejemplo: un evento, una búsqueda en línea, redes sociales, una amistad o una recomendación. Si fue un evento, incluya su nombre.',
  'Common on private/commercial plans.': 'Común en planes privados/comerciales.',
  'Per-Client Medicaid Member IDs': 'IDs de miembro Medicaid por cliente',
  "Since this intake includes multiple clients, capture each child's Medicaid Member ID so billing is stored correctly per client.":
    'Como esta admisión incluye varios clientes, capture el ID de miembro Medicaid de cada niño/a para que la facturación se guarde correctamente por cliente.',
  'Medicaid Member ID': 'ID de miembro Medicaid',
  "Enter this client's Medicaid ID": 'Ingrese el ID Medicaid de este cliente',
  'I have secondary insurance to add': 'Tengo seguro secundario que agregar',
  'This is often where Medicaid is listed when the child also has other primary coverage. TRICARE is generally primary over Medicaid when both are present.':
    'Aquí suele indicarse Medicaid cuando el niño/a también tiene otra cobertura primaria. TRICARE generalmente es primario sobre Medicaid cuando ambos están presentes.',
  'Member ID': 'ID de miembro',
  'Subscriber name': 'Nombre del titular',
  'Secondary card – front': 'Tarjeta secundaria – frente',
  'Secondary card – back': 'Tarjeta secundaria – reverso',
  'Responsible Party (Guarantor)': 'Parte responsable (garante)',
  'Name: Parent/Guardian': 'Nombre: Padre/madre o tutor',
  'Contact info: captured earlier in intake and used for billing/consent communications.':
    'Información de contacto: capturada antes en la admisión y usada para facturación/comunicaciones de consentimiento.',
  'Identity verification': 'Verificación de identidad',
  'To help prevent insurance fraud and protect you, our organization, and our providers, we ask that you verify you are who you say you are. You can skip for now and may be asked later in the portal to provide or upload ID.':
    'Para ayudar a prevenir el fraude de seguros y protegerlo a usted, nuestra organización y nuestros proveedores, le pedimos que verifique que usted es quien dice ser. Puede omitirlo por ahora y se le puede solicitar más adelante en el portal que proporcione o suba su identificación.',
  'Driver’s license or government ID (optional)':
    'Licencia de conducir o identificación oficial (opcional)',
  'Skip identity verification for now': 'Omitir la verificación de identidad por ahora',
  'Thank you for your submission.': 'Gracias por su envío.',
  'Checking…': 'Verificando…',
  'Thank you, you’ve been verified.': 'Gracias, su identidad ha sido verificada.',
  'Please note: Not all insurances are accepted by all providers. If this program or class is not covered by your insurance, we may still submit a claim to your insurer in the event coverage has changed. All payments collected via our web application will be listed as collected outside of our EHR platform and applied to billing claims as necessary. Medicaid (Health First Colorado) clients are enrolled at no cost to the family for eligible programs.':
    'Tenga en cuenta: No todos los seguros son aceptados por todos los proveedores. Si este programa o clase no está cubierto por su seguro, aún podemos enviar un reclamo a su aseguradora si la cobertura ha cambiado. Todos los pagos recopilados en nuestra aplicación web se registrarán como cobrados fuera de nuestra plataforma EHR y se aplicarán a reclamos de facturación según sea necesario. Los clientes de Medicaid (Health First Colorado) se inscriben sin costo para la familia en programas elegibles.',
  'Insurance Authorization & Assignment of Benefits': 'Autorización de seguro y cesión de beneficios',
  'I authorize': 'Autorizo',
  'to release information to the insurance companies provided on this form in order to submit insurance claims on my behalf.':
    'a divulgar información a las compañías de seguros indicadas en este formulario para presentar reclamos de seguro en mi nombre.',
  'This authorization extends to the extent necessary to obtain payment for the services provided to me, and includes authorization to release information about mental health, substance use, or HIV diagnoses as required.':
    'Esta autorización se extiende en la medida necesaria para obtener el pago de los servicios prestados, e incluye autorización para divulgar información sobre salud mental, uso de sustancias o diagnósticos de VIH según se requiera.',
  'In consideration of the services provided to me, I assign all benefits to':
    'En consideración de los servicios prestados, cedo todos los beneficios a',
  'I understand that I remain responsible for all amounts due by me, including (but not limited to) copays, coinsurance, deductible amounts, and all services not covered by my insurance plan (including those for which I fail to obtain prior authorization), and mutually agreed-upon services or fees that are deemed not medically necessary.':
    'Entiendo que sigo siendo responsable de todos los montos adeudados, incluidos (entre otros) copagos, coseguros, deducibles y todos los servicios no cubiertos por mi plan de seguro (incluidos aquellos para los que no obtuve autorización previa), y servicios o tarifas acordadas mutuamente que se consideren no médicamente necesarios.',
  'This is a binding electronic signature. By signing below, you acknowledge that your electronic signature has the same legal effect as a hand-written one. We record your name, the date and time you signed, your IP address, and your browser at finalize time and embed that information in the signed PDF kept on file.':
    'Esta es una firma electrónica vinculante. Al firmar abajo, usted reconoce que su firma electrónica tiene el mismo efecto legal que una firma manuscrita. Registramos su nombre, la fecha y hora de la firma, su dirección IP y su navegador al finalizar, e incorporamos esa información en el PDF firmado archivado.',
  'Sign this authorization': 'Firmar esta autorización',
  'Apply my signature to this authorization': 'Aplicar mi firma a esta autorización',
  'We\'ll re-use the signature you drew earlier in this session — same legal weight as signing here in pen, and you\'ll see it on the signed PDF.':
    'Reutilizaremos la firma que dibujó antes en esta sesión — mismo peso legal que firmar aquí con bolígrafo, y la verá en el PDF firmado.',
  'source: reused signature from earlier in this session':
    'origen: firma reutilizada de antes en esta sesión',
  'Type your name to sign this authorization': 'Escriba su nombre para firmar esta autorización',
  'Your name': 'Su nombre',
  '✓ Signed by': '✓ Firmado por',
  'You can use whatever name you go by — it does not have to be your legal name. We\'ll capture the date, time, IP, and browser as part of the audit trail.':
    'Puede usar el nombre con el que se identifica — no tiene que ser su nombre legal. Registraremos la fecha, hora, IP y navegador como parte del registro de auditoría.',
  'the provider': 'el proveedor',
  'Save & continue': 'Guardar y continuar',

  // ── Public school packet chrome (no live translate on masters) ───────────
  'About You': 'Sobre usted',
  'School ROI': 'Autorización escolar (ROI)',
  'Informed Consent and Group Counseling Consent': 'Consentimiento informado y consentimiento de consejería grupal',
  'Informed + Group Consent': 'Consentimiento informado y grupal',
  'Policy and Services Agreement': 'Acuerdo de políticas y servicios',
  'Policy & Services': 'Políticas y servicios',
  'HIPAA Privacy Policy and Notice of Privacy Practices': 'Política de privacidad HIPAA y Aviso de prácticas de privacidad',
  'HIPAA Notice': 'Aviso HIPAA',
  'Disclosure': 'Divulgación',
  'Disclosure Statement': 'Declaración de divulgación',
  'Guardian waivers & safety': 'Autorizaciones y seguridad del tutor',
  'Waivers': 'Autorizaciones',
  'Insurance information': 'Información del seguro',
  'Insurance': 'Seguro',
  'Communication preferences': 'Preferencias de comunicación',
  'Communications': 'Comunicaciones',
  'Complete': 'Completado',
  'Documents': 'Documentos',
  'Uploads': 'Cargas',
  'Registration': 'Registro',
  'Payment': 'Pago',
  'Payment information': 'Información de pago',
  'Demographics': 'Datos demográficos',
  'Clinical': 'Clínico',
  'Clinical Questions': 'Preguntas clínicas',
  'Questionnaire': 'Cuestionario',
  'References': 'Referencias',
  'Professional references': 'Referencias profesionales',
  'Intake & Registration': 'Admisión y registro',
  'Smart School Referral Packet': 'Paquete digital de inscripción escolar',
  'Smart School Referral Packet (English)': 'Paquete digital de inscripción escolar',
  'School Referral Master': 'Paquete digital de inscripción escolar',
  'School Referral Master (EN)': 'Paquete digital de inscripción escolar',
  'School Referral Master (ES)': 'Paquete digital de inscripción escolar',
  'ESIGN Act Disclosure': 'Divulgación de la Ley ESIGN',
  'By continuing, you consent to electronically sign these documents and receive electronic records. You may request paper copies from the organization.':
    'Al continuar, usted consiente firmar electrónicamente estos documentos y recibir registros electrónicos. Puede solicitar copias en papel a la organización.',
  'Most families spend about 15 minutes to get started. Saved answers stay with this enrollment for 10 days if you agree to reminders, or 12 hours if you do not.':
    'La mayoría de las familias tardan unos 15 minutos en empezar. Las respuestas guardadas permanecen con esta inscripción 10 días si acepta recordatorios, o 12 horas si no acepta.',
  'Tell us a bit about you so we can prepare the right forms.':
    'Cuéntenos un poco sobre usted para que podamos preparar los formularios correctos.',
  'I am completing this form for myself': 'Estoy completando este formulario para mí',
  'I am a parent or guardian submitting for my child(ren)':
    'Soy padre, madre o tutor y lo envío para mi(s) hijo(s)'
};

// Translate only the known application-authored disclosures. Keep custom agency text intact.
const BRANDED_DISCLOSURES_ES = [
  [' offers optional account emails about appointments, school sessions when applicable, schedule changes, secure-message alerts, forms and signatures, enrollment follow-ups, billing and required insurance cards. Medicaid cards are not requested. Choose all optional account emails, scheduling only, or essential messages only. This choice does not include marketing, enroll another adult, or affect your care. Requested login, password recovery and essential security messages are separate.',
   ' ofrece correos opcionales de la cuenta sobre citas, sesiones escolares cuando corresponda, cambios de horario, alertas de mensajes seguros, formularios y firmas, seguimiento de inscripción, facturación y tarjetas de seguro requeridas. No se solicitan tarjetas de Medicaid. Elija todos los correos opcionales de la cuenta, solo programación o solo mensajes esenciales. Esta elección no incluye publicidad, no inscribe a otro adulto ni afecta su atención. Los mensajes solicitados de acceso, recuperación de contraseña y seguridad esencial se gestionan por separado.'],
  [' offers optional text messages for appointment reminders, schedule changes, cancellations and links to sign in or join a scheduled session. Choose Yes or No below. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Choosing No does not affect care, enrollment or school services. This choice does not authorize marketing or enroll other contacts. Texts may appear on a shared phone or lock screen; use the secure app for private details.',
   ' ofrece mensajes de texto opcionales con recordatorios de citas, cambios de horario, cancelaciones y enlaces para iniciar sesión o participar en una sesión programada. Elija Sí o No a continuación. La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para cancelar o HELP para obtener ayuda. Elegir No no afecta la atención, la inscripción ni los servicios escolares. Esta elección no autoriza publicidad ni inscribe a otros contactos. Los mensajes pueden aparecer en un teléfono compartido o en la pantalla de bloqueo; use la aplicación segura para los detalles privados.']
];
const OFFICE_BRANDED_DISCLOSURES_ES = BRANDED_DISCLOSURES_ES.map(([en, es]) => [
  en.replace(', school sessions when applicable', '').replace('care, enrollment or school services', 'care or enrollment'),
  es.replace(', sesiones escolares cuando corresponda', '').replace('la atención, la inscripción ni los servicios escolares', 'la atención ni la inscripción')
]);
function translatedBrandedDisclosure(text) {
  const match = [...BRANDED_DISCLOSURES_ES, ...OFFICE_BRANDED_DISCLOSURES_ES].find(([suffix]) => text.endsWith(suffix) && text.length > suffix.length);
  return match ? text.slice(0, -match[0].length) + match[1] : undefined;
}

const CURATED_INTAKE_ES = { ...OFFICE_INTAKE_ES, ...OFFICE_ENROLLMENT_UI_ES, ...STRUCTURED_INTAKE_STEP_ES, ...OFFICE_SCREEN_ES };
const normalizedCopyKey = text => String(text || '').trim().replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase();
const NORMALIZED_INTAKE_ES = new Map(Object.entries(CURATED_INTAKE_ES).map(([key, value]) => [normalizedCopyKey(key), value]));

export function hasStructuredIntakeTranslation(text) {
  return NORMALIZED_INTAKE_ES.has(normalizedCopyKey(text)) || !!translatedBrandedDisclosure(String(text || ''));
}

export function lookupStructuredIntakeTranslation(en, apiMap = {}) {
  const key = String(en || '');
  if (!key) return key;
  const numberedClient = /^Client (\d+)$/i.exec(key.trim());
  if (numberedClient) return `Cliente ${numberedClient[1]}`;
  return CURATED_INTAKE_ES[key] || NORMALIZED_INTAKE_ES.get(normalizedCopyKey(key)) || translatedBrandedDisclosure(key) || apiMap[key] || key;
}

export function txFmtStructuredIntake(template, vars = {}, apiMap = {}, locale = 'en') {
  let s = locale === 'es' ? lookupStructuredIntakeTranslation(template, apiMap) : String(template || '');
  for (const [k, v] of Object.entries(vars || {})) {
    s = s.split(`{${k}}`).join(String(v ?? ''));
  }
  return s;
}
