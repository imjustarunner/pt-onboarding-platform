export const SCHOOL_PACKET_TEMPLATE_TOKENS = [
  '{{SCHOOL_NAME}}',
  '{{SCHOOL_ADDRESS}}',
  '{{SCHOOL_STAFF_TABLE}}',
  '{{DISCLOSURE_CARE_TEAM}}'
];

/**
 * Default Spanish school packet template HTML.
 *
 * This is a complete, full-paragraph translation of the static legal/consent
 * text (not a partial heading-only pass) — this content changes rarely
 * (occasional legal-language updates), so it's maintained as a stable,
 * professionally translated document rather than re-translated piecemeal.
 * The two sections that change frequently — the Authorized School Staff
 * roster and the Mental Health Professional Information / Your Care Team
 * section — are NOT hardcoded text here; they are generated live from
 * database rows via {{SCHOOL_STAFF_TABLE}} / {{DISCLOSURE_CARE_TEAM}}, with
 * their column headers and labels localized in code (see
 * schoolPrintablePacket.service.js STAFF_TABLE_LABELS / CARE_TEAM_LABELS), so
 * new staff/providers never require a manual translation pass.
 *
 * Still recommended: a native-speaker / legal review pass before relying on
 * this for real client signatures.
 */
export const DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES = `
<section class="school-packet-template">
<div class="intake-compact">
  <h1>CUESTIONARIO DE INGRESO</h1>
  <table class="form-table">
    <colgroup>
      <col style="width:22%" />
      <col style="width:18%" />
      <col style="width:12%" />
      <col style="width:16%" />
      <col style="width:14%" />
      <col style="width:18%" />
    </colgroup>
    <tbody>
      <tr>
        <td>Nombre del dependiente</td>
        <td class="form-blank" colspan="5"></td>
      </tr>
      <tr>
        <td>Fecha de nacimiento del dependiente</td>
        <td class="form-blank" colspan="2"></td>
        <td>Edad del dependiente</td>
        <td class="form-blank" colspan="2"></td>
      </tr>
      <tr>
        <td>Sexo del dependiente</td>
        <td class="form-blank" colspan="2"></td>
        <td>Grado del dependiente</td>
        <td class="form-blank" colspan="2"></td>
      </tr>
      <tr>
        <td>Dirección del dependiente</td>
        <td class="form-blank" colspan="5"></td>
      </tr>
      <tr>
        <td>Ciudad del dependiente</td>
        <td class="form-blank" colspan="1"></td>
        <td>Estado</td>
        <td class="form-blank" colspan="1"></td>
        <td>Código postal</td>
        <td class="form-blank" colspan="1"></td>
      </tr>
    </tbody>
  </table>

  <p>¿Es usted el padre/madre legal o custodio del menor mencionado anteriormente? ___ Sí ___ No</p>
  <p>Tengo el derecho legal de obtener tratamiento para el menor mencionado anteriormente: ___ Sí ___ No</p>
  <p>En casos de divorcio, es importante que ambos padres del menor otorguen permiso para los servicios. Es posible que se le solicite proporcionar una copia de la orden judicial que lo designe como el custodio legal del menor mencionado.</p>
  <p>¿Está dispuesto/a a proporcionar dicha documentación? ___ Sí ___ No</p>

  <div class="plain-fill-rows">
    <div class="plain-fill-row"><span class="inline-fill-label">Su nombre</span><span class="inline-fill-line"></span></div>
    <div class="plain-fill-row"><span class="inline-fill-label">Su teléfono</span><span class="inline-fill-line"></span></div>
    <div class="plain-fill-row"><span class="inline-fill-label">Su correo electrónico</span><span class="inline-fill-line"></span></div>
    <div class="plain-fill-row"><span class="inline-fill-label">Otro padre/tutor — nombre, teléfono y correo</span><span class="inline-fill-line"></span></div>
    <div class="plain-fill-row"><span class="inline-fill-label">&nbsp;</span><span class="inline-fill-line"></span></div>
  </div>

  <table class="form-table insurance-table">
    <colgroup>
      <col style="width:22%" />
      <col style="width:28%" />
      <col style="width:22%" />
      <col style="width:28%" />
    </colgroup>
    <tbody>
      <tr>
        <td>Seguro primario</td>
        <td class="form-blank"></td>
        <td>Seguro secundario</td>
        <td class="form-blank"></td>
      </tr>
      <tr>
        <td>Titular de la póliza</td>
        <td class="form-blank"></td>
        <td>Titular secundario</td>
        <td class="form-blank"></td>
      </tr>
      <tr>
        <td>Número de identificación de miembro</td>
        <td class="form-blank"></td>
        <td>Número de identificación secundario</td>
        <td class="form-blank"></td>
      </tr>
      <tr>
        <td>Número de grupo de la póliza</td>
        <td class="form-blank"></td>
        <td>Número de grupo secundario</td>
        <td class="form-blank"></td>
      </tr>
    </tbody>
  </table>

  <p>Historial de abuso físico _______ Sí _______ No</p>
  <p>Historial de negligencia _______ Sí ________ No</p>
  <p>Historial de abuso emocional/mental ________ Sí ________ No</p>
  <p>Por favor explique:</p>
  <div class="answer-lines"><div class="answer-line"></div><div class="answer-line"></div><div class="answer-line"></div></div>

  <p>Por favor enumere cualquier información médica necesaria, incluyendo alergias alimentarias.</p>
  <div class="answer-lines"><div class="answer-line"></div><div class="answer-line"></div></div>
</div>

  <div class="page-break"></div>
  <h3>Por favor seleccione la respuesta que mejor describa a su dependiente:</h3>
  <table class="form-table">
    <colgroup>
      <col style="width:58%" />
      <col style="width:14%" />
      <col style="width:14%" />
      <col style="width:14%" />
    </colgroup>
    <tbody>
      <tr><td>Inquieto/a, no puede quedarse quieto/a</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Actúa como si tuviera un motor por dentro</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Se distrae soñando despierto/a demasiado</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Se distrae con facilidad</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Se siente triste, infeliz</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Se siente desesperanzado/a</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Tiene dificultad para concentrarse</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Pelea con otros</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Se siente mal consigo mismo/a</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Se preocupa mucho</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Parece divertirse menos</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>No obedece las reglas</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>No comprende los sentimientos de otras personas</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Se burla de otros</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Culpa a otros de sus problemas</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Toma cosas que no le pertenecen</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
      <tr><td>Se niega a compartir</td><td>Nunca</td><td>A veces</td><td>Frecuentemente</td></tr>
    </tbody>
  </table>

  <div class="intake-compact">
  <p>¿Cuánto tiempo lleva siendo esto una preocupación?</p>
  <div class="answer-lines"><div class="answer-line"></div></div>

  <p>¿Qué espera obtener de la consejería?</p>
  <div class="answer-lines"><div class="answer-line"></div><div class="answer-line"></div></div>

  <p>¿Algo le ha resultado útil en el pasado?</p>
  <div class="answer-lines"><div class="answer-line"></div></div>
  </div>

  <div class="page-break"></div>
  <h2>CONSENTIMIENTO PARA DIVULGAR E INTERCAMBIAR INFORMACIÓN DE SALUD PROTEGIDA</h2>
  <p><strong>Aviso:</strong> Este documento se genera de forma predeterminada. Los datos de identidad del cliente y del tutor se obtienen del cuestionario de ingreso completado (nombre del cliente, fecha de nacimiento, padre/tutor). Regla predeterminada: los elementos están autorizados a menos que se marque la casilla de Denegar cuando esté disponible. Esta divulgación es para coordinación con:</p>
  <p><strong>Relación con la parte:</strong> Estudiante</p>
  <p><strong>Nombre de la escuela:</strong> {{SCHOOL_NAME}}</p>
  <p><strong>Dirección de la escuela:</strong> {{SCHOOL_ADDRESS}}</p>
  <p>Los servicios basados en la escuela requieren las autorizaciones marcadas como Requeridas a continuación. Si no se siente cómodo/a con los términos requeridos, es posible que los servicios en la escuela no sean la mejor opción en este momento. ITSCO también ofrece servicios en oficina y puede analizar esa opción escribiendo a support@itsco.health o llamando al 719-657-7444 ext. 0.</p>

  <h3>Autorizaciones requeridas</h3>
  <p><strong>(sin opción de denegación para los servicios en la escuela)</strong></p>
  <p>Al firmar, autorizo a ITSCO y a los proveedores/personal asignados a coordinar servicios psicológicos en las instalaciones escolares; compartir información limitada de programación y seguridad cuando sea necesario, restringida a los detalles operativos que se necesite conocer; realizar divulgaciones relacionadas con la seguridad cuando sea necesario para prevenir o disminuir una amenaza grave e inminente, según lo permita la ley (incluyendo 45 CFR 164.512(j)); y mantener los estándares de confidencialidad/documentación y registrar la correspondencia en el expediente clínico según lo requiera la ley.</p>

  <h3>Autorizaciones opcionales</h3>
  <p>Marque Denegar únicamente si no autoriza ese elemento.</p>
  <ul>
    <li>Denegar comunicación escolar y planificación de cuidado (comunicación con el personal escolar aprobado para apoyar necesidades/plan de cuidado).</li>
    <li>Denegar metas y planes de tratamiento (breve discusión de metas/objetivos del tratamiento para coordinación; sin detalles del contenido de las sesiones más allá del propósito del cuidado).</li>
  </ul>

  <h3>Duración de la autorización</h3>
  <p>Esta autorización es válida por 36 meses a partir de la fecha de firma, a menos que se revoque antes por escrito.</p>

  <div class="page-break"></div>
  <h3>Personal Escolar Autorizado</h3>
  <p>Todo el personal enumerado está autorizado a menos que se marque Denegar.</p>
  <p>{{SCHOOL_STAFF_TABLE}}</p>

  <h3>Divulgaciones importantes</h3>
  <ul>
    <li>La información divulgada por ITSCO puede ser redivulgada por los destinatarios y podría dejar de estar protegida de la misma manera después de dicha divulgación.</li>
    <li>Puedo revocar esta autorización en cualquier momento comunicándome a support@itsco.health o al 719-657-7444 ext. 0, pero las acciones tomadas previamente no pueden revertirse.</li>
    <li>Entiendo las posibles consecuencias de la divulgación y autorizo voluntariamente la divulgación descrita anteriormente, excepto los elementos o personas explícitamente denegados mediante la casilla correspondiente.</li>
  </ul>

  <h3>Contacto de ITSCO</h3>
  <p>Generado por el representante autorizado de ITSCO, Michael Mendez, MA, LPC | Fundador</p>
  <p>Preguntas o inquietudes de privacidad: Privacy@ITSCO.health</p>
  <p>Dirección principal: 437 Windchime Pl, Colorado Springs, CO 80919</p>

  <div class="signature-box">
    <div class="signature-box-title">Firme aquí — requerido</div>
    <div class="sig-row">
      <span class="sig-label">Firma del cliente o parte responsable</span>
      <span class="sig-line"></span>
      <span class="sig-date-label">Fecha</span>
      <span class="sig-date-line"></span>
    </div>
  </div>

  <div class="page-break"></div>
  <h2>RESUMEN DE RECONOCIMIENTO Y CONSENTIMIENTO</h2>
  <p>Al firmar a continuación, reconozco y doy mi consentimiento a los siguientes documentos, cuyas versiones corresponden a la fecha de la firma de este documento e incluidas en la Versión 1.14:</p>
  <ul>
    <li>Reconocimiento de Información de Seguro (p.6): Autorizo a ITSCO, LLC a divulgar información a las compañías de seguros proporcionadas, con el fin de presentar reclamos en mi nombre.</li>
    <li>Consentimiento de Menor (p.6) y Consentimiento Informado (p.7): Confirmo que he revisado, entiendo y acepto los términos descritos en los documentos de Consentimiento de Menor y Consentimiento Informado, reconociendo los derechos, responsabilidades y la relación terapéutica establecida entre el cliente e ITSCO.</li>
    <li>Consentimiento Grupal (p.10): He leído y entiendo los términos descritos en el documento de Consentimiento Grupal, reconociendo los derechos, responsabilidades, riesgos potenciales, reglas y limitaciones a la participación grupal, si corresponde.</li>
    <li>Acuerdo de Políticas y Servicios (p.13): He leído y acepto los términos del Acuerdo de Políticas y Servicios, entendiendo los servicios, políticas, y mis derechos y obligaciones de ITSCO dentro del entorno escolar y de práctica privada.</li>
    <li>Declaración de Divulgación (p.16): Reconozco haber recibido y comprendido la Declaración de Divulgación, que detalla los marcos regulatorios y mis derechos como cliente o tutor dentro del proceso terapéutico.</li>
    <li>Política de Privacidad de HIPAA (p.19): Reconozco la Política de Privacidad de HIPAA y entiendo mis derechos de privacidad de información de salud bajo la Ley de Portabilidad y Responsabilidad del Seguro Médico.</li>
    <li>Declaración Personal: Por la presente declaro que toda la información y firmas proporcionadas para los documentos mencionados anteriormente están relacionadas únicamente con la persona mencionada y su información personal. No se incluye ni se implica la información o firma de ninguna otra persona.</li>
    <li>Cumplimiento de la Ley: Cuando este resumen y reconocimiento difieran de las leyes estatales o federales pertinentes, dichas leyes prevalecerán.</li>
  </ul>
  <div class="signature-box">
    <div class="signature-box-title">Firme aquí — requerido (todas las firmas de esta página)</div>
    <div class="sig-row">
      <span class="sig-label">Nombre en letra de molde</span>
      <span class="sig-line"></span>
    </div>
    <div class="sig-row">
      <span class="sig-label">Relación con el dependiente Y autoridad para consentir (si es el cliente, "self")</span>
      <span class="sig-line"></span>
    </div>
    <div class="sig-row">
      <span class="sig-label">Firma del cliente o parte responsable</span>
      <span class="sig-line"></span>
      <span class="sig-date-label">Fecha</span>
      <span class="sig-date-line"></span>
    </div>
    <div class="sig-row">
      <span class="sig-label">Firma del padre/tutor #2 (si aplica)</span>
      <span class="sig-line"></span>
      <span class="sig-date-label">Fecha</span>
      <span class="sig-date-line"></span>
    </div>
  </div>

  <div class="page-break"></div>
  <div class="packet-records-banner">
    <div class="packet-records-banner-title">Páginas 6 en adelante — solo para sus registros</div>
    <p class="packet-note-gray">Por favor conserve estos documentos para sus registros personales. Incluyen información importante sobre sus derechos, nuestras políticas y los servicios específicos ofrecidos. Su reconocimiento y firmas relacionadas con estos asuntos han sido capturados en la página de Resumen de Reconocimiento y Consentimiento. Conservar una copia de estos documentos le asegurará tener acceso a los detalles importantes de nuestro acuerdo y sus protecciones de privacidad mientras avanzamos en nuestra relación profesional.</p>
  </div>

  <h2>INFORMACIÓN DEL SEGURO</h2>
  <p>Otorgo permiso a ITSCO, LLC para divulgar la información necesaria a las aseguradoras enumeradas en este formulario con el fin de presentar reclamos. Este permiso incluye compartir detalles relevantes para asegurar el pago de los servicios prestados, tales como información de salud mental, uso de sustancias o relacionada con el VIH. Además, asigno cualquier beneficio elegible directamente a ITSCO, LLC y permito que los pagos de mis aseguradoras, Medicare u otros pagadores se realicen directamente a ellos. Reconozco mi responsabilidad por cualquier cargo no cubierto por mi seguro, incluyendo copagos, coseguros, deducibles, servicios no aprobados por mi seguro y tarifas por servicios considerados no médicamente necesarios.</p>

  <h2>CONSENTIMIENTO DE MENOR</h2>
  <p>Los servicios de consejería para menores requieren una autorización legal clara. Esto incluye el consentimiento y la aprobación para el tratamiento de ambos padres o tutores, a menos que se proporcione documentación específica en el momento del ingreso que indique lo contrario, o en casos en que los padres estén casados y compartan la custodia total conjunta. La firma de un padre o tutor legal custodio en la documentación de ingreso autoriza a ITSCO a realizar una evaluación de salud mental y brindar tratamiento al menor mencionado. Esta autorización permanece vigente hasta que se termine la relación profesional o se revoque explícitamente el consentimiento.</p>
  <p>Es esencial que ITSCO garantice que la persona que solicita servicios para un menor tenga el derecho legal de hacerlo. En situaciones de divorcio, se requiere el consentimiento de ambos padres para que el menor reciba servicios. Los padres divorciados, padrastros/madrastras, abuelos, tutores u otras personas pueden necesitar proporcionar una copia de la orden judicial que los establezca como el custodio legal del menor. Este proceso existe para proteger el entorno terapéutico y salvaguardar el derecho del menor a la privacidad y a una terapia confidencial, de acuerdo con los requisitos legales y la ética profesional.</p>
  <!-- intake-legal-resources -->
  <div class="packet-intake-legal">
    <p>Seguimos la ley de Colorado aplicable y la ética profesional. En Colorado, un menor de 12 años o más puede, en algunas situaciones, consentir psicoterapia. Esto es información, no asesoría legal. El proveedor asignado aplicará las reglas que correspondan a este menor.</p>
    <ul>
      <li><a href="https://resources.csi.state.co.us/wp-content/uploads/2022/07/GT-Alert_Colorado-Lowers-Age-of-Consent-for-Psychotherapy-Services-to-12-Years-Old.pdf" target="_blank" rel="noopener noreferrer">Edad de consentimiento para psicoterapia en Colorado (alerta CSI / GT, 2019)</a></li>
      <li><a href="https://leg.colorado.gov/bills/hb17-1320" target="_blank" rel="noopener noreferrer">Colorado HB17-1320 (historial legislativo relacionado)</a></li>
    </ul>
  </div>
  <!-- /intake-legal-resources -->

  <div class="page-break"></div>
  <h2>CONSENTIMIENTO INFORMADO</h2>
  <p>Este documento contiene información importante sobre los derechos del cliente y las responsabilidades de cada una de las partes al iniciar la relación entre consejero y cliente. Creemos que una relación terapéutica bien formada es el vehículo para el progreso y es necesaria para el proceso de sanación.</p>
  <p>Por favor asegúrese de revisar y comprender cuidadosamente la información contenida en este documento. Forma parte de un conjunto integral de documentos que detallan nuestros servicios profesionales, políticas y sus derechos como cliente o tutor. Le animamos a tomarse su tiempo para leer este material y a discutir cualquier tema o pregunta que tenga con su consejero o facilitador asignado. Su comprensión y sus preguntas son fundamentales para nosotros, ya que ayudan a establecer una relación terapéutica clara e informada. Su reconocimiento y consentimiento formal a este y otros documentos relacionados se capturarán en una página de resumen provista para su firma.</p>

  <h3>Derechos del Cliente</h3>
  <ul>
    <li>El cliente (o su padre/tutor legal) puede hacer cualquier pregunta sobre qué esperar durante la terapia y sobre el resultado final de esta.</li>
    <li>El cliente (o su padre/tutor legal) puede negarse a continuar en la terapia en cuanto a las técnicas que pueda emplear el consejero.</li>
    <li>El cliente (o su padre/tutor legal) puede dejar de continuar la terapia en cualquier momento, sin impedimento, y puede regresar a la terapia en cualquier momento.</li>
    <li>El consejero tiene el derecho de dar de baja al cliente del curso de la terapia.</li>
    <li>El cliente (o su padre/tutor legal) tiene el derecho de revisar sus expedientes con el terapeuta.</li>
    <li>El cliente (o su padre/tutor legal) puede plantear cualquier inquietud y hablar con el terapeuta de inmediato sobre dichas inquietudes, siempre que el terapeuta esté disponible para discutir estos asuntos con el cliente (o su padre/tutor legal).</li>
  </ul>

  <h3>Derecho a la Confidencialidad</h3>
  <p>La Ley de Portabilidad y Responsabilidad del Seguro Médico (HIPAA), junto con las leyes estatales y locales pertinentes, rige estrictamente la manera en que ITSCO maneja su información de salud protegida (PHI). ITSCO se considera una "entidad cubierta" bajo HIPAA, lo que significa que cumplimos con las normas de privacidad de HIPAA. En general, existen tres propósitos para los cuales podemos usar su información de salud protegida: tratamiento, pago y operaciones de atención médica. Nuestro aviso completo de prácticas de privacidad también se encuentra disponible en nuestro sitio web en ITSCO.health/privacy.</p>
  <p>Como entidad cubierta por HIPAA, ITSCO mantiene toda su PHI (incluyendo cualquier comunicación que tenga con su consejero) de manera estrictamente confidencial. Sin embargo, existen excepciones, incluyendo situaciones en las que ITSCO debe divulgar información conforme a la ley estatal y federal. A continuación se enumeran algunas de estas excepciones:</p>
  <ul>
    <li>El cliente firma un consentimiento o autorización por escrito para usar o divulgar su PHI.</li>
    <li>El cliente expresa una intención seria de hacerse daño a sí mismo o a otra persona.</li>
    <li>Existe sospecha razonable de abuso o negligencia contra un menor, una persona de edad avanzada o un adulto dependiente.</li>
    <li>Para fines de facturación.</li>
    <li>Para fines de supervisión.</li>
    <li>Por citación judicial u orden de un tribunal.</li>
  </ul>

  <h3>Confidencialidad en las Escuelas</h3>
  <p>La confidencialidad en el entorno de cuidado escolar tiene limitaciones. Al firmar, usted reconoce que la confidencialidad total para su dependiente menor no está garantizada, aceptando el riesgo de que otras personas se enteren de su asistencia a terapia. Los riesgos incluyen que maestros y compañeros de clase puedan enterarse de las sesiones de terapia debido a ausencias justificadas o al ver al dependiente con un clínico; y que el personal escolar involucrado en la supervisión de pasillos, asistencia o labores de oficina también pueda estar al tanto de la participación del dependiente en los servicios terapéuticos.</p>

  <h3>Declaración de Calificación del Clínico</h3>
  <p>ITSCO emplea a personas que brindan servicios según su nivel de capacitación y calificaciones. El cliente (o su padre/tutor legal) reconoce que, cuando no esté prohibido por el estado de licencia o la normativa estatal, la sesión puede ser conducida por un profesional a nivel de licenciatura, un profesional con maestría sin licencia, o un profesional con licencia provisional bajo la supervisión activa y directa de un clínico con licencia completa. Si desea conocer el estado de licencia de su clínico, puede encontrar esa información en su biografía en www.ITSCO.health o en el Acuerdo de Divulgación. Si tiene alguna otra pregunta, por favor escriba a Rachel@ITSCO.health.</p>

  <h3>Observación Educativa</h3>
  <p>Como parte de nuestro compromiso con el aprendizaje continuo y la educación en el campo de la salud mental, ITSCO puede involucrar a pasantes o aprendices en las sesiones de terapia con fines educativos y de capacitación. Estas personas están sujetas a los mismos estándares de confidencialidad y conducta profesional que nuestros terapeutas con licencia.</p>
  <p>Al firmar este consentimiento, usted autoriza la observación ocasional de sus sesiones de terapia por parte de estos aprendices o pasantes. Estas observaciones se realizarán de manera discreta y se utilizarán únicamente con el fin de mejorar los estándares educativos y profesionales. Nunca se permitirá ninguna grabación de video o audio.</p>

  <h3>Declaración de Expedientes Profesionales</h3>
  <p>ITSCO está obligado a mantener expedientes apropiados de los servicios de atención médica que brindamos. Sus expedientes (o los de su menor) se mantienen en un sistema seguro de expedientes de salud electrónicos. Salvo en circunstancias inusuales que impliquen peligro para el cliente, este tiene derecho a obtener una copia de sus expedientes de salud con la autorización adecuada.</p>

  <h3>Declaración de Comunicación Electrónica y Consejería en Línea</h3>
  <p>El teléfono (incluyendo mensajes de texto), el correo electrónico y la videoconferencia no son métodos de comunicación encriptados, y existe cierto riesgo de confidencialidad con su uso. Nuestro equipo se comunica utilizando estos medios. Al firmar este documento, usted consiente que su consejero (o el de su menor), o alguien de nuestro equipo, se comunique con usted por teléfono, mensaje de texto o correo electrónico para fines de programación, facturación, control de calidad u otras razones.</p>

  <h3>Contactos de Emergencia</h3>
  <p>Su consejero establecerá contactos de emergencia para usted, tales como un familiar, un teléfono celular o un número de teléfono del trabajo. Estos contactos podrán utilizarse si su consejero percibe la necesidad de hacerlo. Si usted está teniendo pensamientos suicidas activos o si se encuentra en crisis y no puede comunicarse con su consejero, por favor acuda a la sala de emergencias más cercana, llame al 1-844-493-TALK, o llame/envíe un mensaje de texto al 988.</p>

  <h2>CONSENTIMIENTO GRUPAL</h2>
  <p>Nuestro programa utiliza principalmente Skill Builders para mejorar la salud mental, el funcionamiento social y la integración comunitaria a través de actividades estructuradas. Sin embargo, el trabajo grupal también puede incluir otras formas de participación más allá del desarrollo de habilidades.</p>
  <p>Por favor asegúrese de revisar y comprender cuidadosamente la información contenida en este documento. Forma parte de un conjunto integral de documentos que detallan nuestros servicios profesionales, políticas y sus derechos como cliente o tutor. Le animamos a tomarse su tiempo para leer este material y a discutir cualquier tema o pregunta que tenga con su consejero o facilitador asignado. Su comprensión y sus preguntas son fundamentales para nosotros, ya que ayudan a establecer una relación terapéutica clara e informada. Su reconocimiento y consentimiento formal a este y otros documentos relacionados se capturarán en una página de resumen provista para su firma.</p>
  <h3>Objetivos y Beneficios</h3>
  <ul>
    <li>Desarrollo de habilidades: Mejorar las habilidades sociales, estrategias de afrontamiento, autoestima y conciencia sobre la salud mental.</li>
    <li>Bienestar emocional: Promover hábitos saludables y facilitar las transiciones a nuevos entornos.</li>
    <li>Integración comunitaria: Empoderar a los participantes en su proceso de salud mental y fomentar un sentido de pertenencia.</li>
  </ul>
  <h3>Función de los Facilitadores Grupales</h3>
  <p>Los facilitadores desempeñan un papel fundamental en la creación de un entorno seguro y de apoyo donde los participantes puedan desarrollar activamente las habilidades necesarias. Adaptan las actividades a las necesidades individuales, fomentan la comunicación abierta y garantizan la seguridad del grupo. Pueden estar presentes facilitadores adicionales o cofacilitadores para ayudar a que los grupos funcionen de manera segura y eficaz, y todos están sujetos a los mismos estándares de confidencialidad.</p>
  <h3>Riesgos Potenciales</h3>
  <ul>
    <li>Malestar emocional: Los participantes podrían experimentar emociones intensas o recordar experiencias desagradables.</li>
    <li>Dinámicas grupales: Existe el riesgo de comentarios o comportamientos que generen malestar o desencadenen reacciones por parte de otros miembros, especialmente dada la diversidad de antecedentes y culturas dentro del grupo.</li>
  </ul>
  <h3>Seguridad y Conducta</h3>
  <ul>
    <li>Conducta del participante: Se espera un comportamiento respetuoso, con tolerancia cero hacia la agresión o el acoso.</li>
    <li>Contacto físico: Los participantes deben asumir que no habrá sujeciones ni contacto físico durante las sesiones.</li>
    <li>Protocolos de emergencia: Si un participante se vuelve agresivo, amenaza a otros o intenta irse, se contactará a la policía del campus o del distrito. Si un participante abandona el campus o los terrenos escolares, se llamará al 911.</li>
    <li>Asistencia constante: La participación regular es fundamental para la eficacia del desarrollo de habilidades. Las ausencias frecuentes sin previo aviso pueden dar lugar a una reevaluación de la idoneidad del participante.</li>
    <li>Tolerancia cero hacia sustancias: Existe una política de tolerancia cero para cualquier sustancia, incluyendo vapeadores, durante las sesiones grupales.</li>
  </ul>
  <h3>Confidencialidad</h3>
  <ul>
    <li>Privacidad: La información compartida dentro del grupo debe permanecer confidencial.</li>
    <li>Divulgación legal: Las excepciones incluyen situaciones que involucren abuso, autolesión o daño a otros.</li>
  </ul>
  <h3>Derechos del Cliente</h3>
  <ul>
    <li>Derecho a rechazar: Los participantes pueden rechazar cualquier parte del programa o de las actividades sin que esto afecte su participación general.</li>
    <li>Derecho a la información: Los participantes pueden solicitar información sobre el programa, su progreso o cualquier cambio en la estructura del programa.</li>
  </ul>
  <h3>Terminación de la Participación</h3>
  <ul>
    <li>Por parte del participante: Los participantes pueden retirarse en cualquier momento sin perjuicio ni obligación de continuar.</li>
    <li>Por parte del facilitador: Los facilitadores pueden dar por terminada la participación si se considera que no es en el mejor interés del participante o del grupo, especialmente si la negativa constante a participar indica que otros servicios podrían ser más adecuados.</li>
  </ul>
  <h3>Participación Voluntaria</h3>
  <p>La participación en el programa es voluntaria. Sin embargo, la negativa constante a participar en las actividades podría sugerir que otros servicios podrían satisfacer mejor las necesidades del participante, en cuyo caso el facilitador podrá referirlo a otros recursos.</p>
  <h3>Responsabilidad</h3>
  <ul>
    <li>Responsabilidad del sitio anfitrión: El proveedor del local, al ofrecer espacio para nuestro programa, no participa en su operación ni contenido. Quedan exentos de toda responsabilidad, reclamo o acción derivada del programa, excepto en casos de negligencia grave o conducta dolosa.</li>
    <li>Exclusividad operativa: El socio facilitador es el único responsable de la ejecución del programa, la selección de participantes, el contenido y las actividades.</li>
    <li>Facturación y responsabilidades financieras: Todas las consultas de facturación deben dirigirse al socio facilitador, eximiendo al sitio anfitrión de cualquier responsabilidad financiera.</li>
    <li>No participación en el cuidado: El sitio anfitrión no influye ni participa en los servicios terapéuticos ni en las decisiones de cuidado, por lo que no asume responsabilidad alguna por los resultados del cuidado.</li>
    <li>Indemnización: El socio facilitador se compromete a indemnizar al sitio anfitrión por pérdidas o daños relacionados con el programa, excepto aquellos causados directamente por el sitio anfitrión.</li>
    <li>Situaciones de emergencia: El rol del sitio anfitrión en emergencias se limita a proporcionar acceso a los servicios de emergencia, sin responsabilidad por la causa del incidente.</li>
    <li>Limitación de responsabilidad: La responsabilidad de nuestra organización se limita a la negligencia directa o conducta dolosa. Algunos riesgos, incluidas posibles violaciones de confidencialidad relacionadas con aspectos del lugar, están fuera de nuestro control.</li>
  </ul>
  <h3>Alimentos y Refrigerios</h3>
  <ul>
    <li>Provisión de refrigerios: Nuestra organización podrá proporcionar refrigerios durante las sesiones.</li>
    <li>Refrigerios personales: Se permite que los participantes traigan sus propios refrigerios durante los horarios designados, pero deben indicar cualquier alergia alimentaria en su documento de ingreso para garantizar la seguridad.</li>
  </ul>
  <h3>Conclusión de la Participación</h3>
  <p>Si el programa no satisface sus necesidades, los facilitadores le ayudarán a encontrar recursos o referencias alternativas.</p>
  <h3>Reconocimiento</h3>
  <p>Al firmar, usted reconoce comprender los derechos, responsabilidades y posibles resultados de participar en nuestro trabajo grupal, incluyendo el programa Skill Builders.</p>

  <div class="page-break"></div>
  <h2>ACUERDO DE POLÍTICAS Y SERVICIOS</h2>
  <p>Este documento contiene información importante sobre nuestros servicios profesionales y políticas comerciales.</p>
  <p>Por favor asegúrese de revisar y comprender cuidadosamente la información contenida en este documento. Forma parte de un conjunto integral de documentos que detallan nuestros servicios profesionales, políticas y sus derechos como cliente o tutor. Le animamos a tomarse su tiempo para leer este material y a discutir cualquier tema o pregunta que tenga con su consejero o facilitador asignado. Su comprensión y sus preguntas son fundamentales para nosotros, ya que ayudan a establecer una relación terapéutica clara e informada. Su reconocimiento y consentimiento formal a este y otros documentos relacionados se capturarán en una página de resumen provista para su firma.</p>
  <h3>Acerca de Nuestros Servicios en las Escuelas</h3>
  <p>Nuestro objetivo es ofrecer servicios excepcionales de consejería de práctica privada a estudiantes individuales en el entorno escolar. Queremos empoderar a los estudiantes para que alcancen su máximo potencial a través de terapia individual apropiada, aprendizaje de habilidades/uso de herramientas y estrategias, y el fortalecimiento de sus fortalezas.</p>
  <p>Nuestro objetivo es que los estudiantes alcancen su máximo potencial emocional y mental, así como académico, eliminando las cargas de viaje, tiempo y programación.</p>
  <p>ITSCO ofrece servicios de consejería individualizados a niños desde Kínder hasta el 12.º grado dentro de la escuela. La empresa busca ayudar a los niños a explorar su verdadero potencial, desarrollar habilidades de afrontamiento, sobrellevar situaciones estresantes de la vida y mejorar su salud mental. Ofrecemos un entorno seguro y agradable para que los estudiantes crezcan en todas las áreas de su vida.</p>
  <h3>Acerca de Nuestros Servicios Fuera de las Escuelas</h3>
  <p>ITSCO también mantiene ubicaciones físicas ("brick and mortar") para ofrecer consejería de práctica privada fuera de las escuelas. Estas oficinas serán utilizadas por nuestros consejeros para una variedad de sesiones, incluyendo la atención de sus clientes fuera del horario y días escolares (incluido el verano), sesiones familiares, sesiones grupales y consejería individual que se extiende a adultos de todas las edades.</p>
  <p>Nuestros consejeros brindan atención terapéutica de salud mental personalizada utilizando una variedad de especialidades y están facultados para crear su propia carga de casos además de sus horas escolares.</p>
  <h3>Reconocimiento de Servicios Independientes</h3>
  <p>Al firmar este documento, usted acepta y entiende que ITSCO NO es empleado de la escuela o el distrito de su hijo/a. ITSCO es una compañía de responsabilidad limitada independiente y de propiedad privada que brinda servicios directamente a los estudiantes con el permiso directo del distrito y de cada escuela. La escuela de su hijo/a acuerda proporcionar a ITSCO un entorno seguro y privado para que su hijo/a y el consejero se reúnan sin interrupciones. ITSCO es un servicio independiente.</p>
  <h3>Política de Asistencia de Tres Faltas</h3>
  <p>Los proveedores de ITSCO solo pueden atender, en promedio, a 6 clientes por día escolar y no pueden reemplazar una sesión perdida como lo haría un proveedor típico en un entorno de oficina, debido a que solo atienden a los estudiantes que asisten a esa escuela en particular. Por lo tanto, los cupos se priorizarán para los clientes que puedan asistir de manera constante.</p>
  <p>Los clientes que falten a 3 sesiones por cualquier motivo durante un año escolar podrían perder su horario de sesión recurrente y, por lo tanto, serán colocados en una lista de espera o transferidos a atención en oficina, según corresponda. En caso de que un estudiante esté ausente de la escuela, se podrá realizar una sesión virtual con el padre/tutor, la cual no se considerará una sesión perdida.</p>
  <h3>Cese de Servicios/Terminación</h3>
  <p>Al firmar este documento, usted acepta, entiende y reconoce lo siguiente:</p>
  <ul>
    <li>Puede terminar su terapia o la de su hijo/a/menor en cualquier momento y por cualquier motivo.</li>
    <li>El cese de servicios puede ocurrir por diversas razones, incluyendo, entre otras, una mala adecuación, falta de progreso, inasistencias repetidas (consulte nuestra política de inasistencias/cancelaciones a continuación) y cuando los problemas de un cliente estén fuera de la capacitación del consejero.</li>
    <li>En caso de terminación mientras se atiende con un consejero dentro de la escuela, ITSCO lo referirá a usted, a su familia o a su hijo/a/menor a opciones fuera del entorno escolar.</li>
    <li>ITSCO no puede garantizar que se enviará un consejero alternativo a la escuela.</li>
    <li>En caso de terminación debido a que el consejero de su hijo/a/menor deje nuestra organización, ITSCO hará todo lo posible por reemplazar a ese clínico en la escuela de su hijo/a/menor. Si ITSCO no logra cumplir ese objetivo, le proporcionará varias referencias, las cuales muy probablemente no se llevarán a cabo en la escuela de su hijo/a/menor. ITSCO no puede garantizar disponibilidad en dichas referencias.</li>
  </ul>
  <h3>Transporte/Selección de Consejeros</h3>
  <p>En casi todos los casos, ITSCO selecciona a un consejero para atender hasta seis estudiantes por día en una ubicación en particular. Dicha ubicación se asigna según la disponibilidad del consejero, así como la distancia que debe recorrer desde su domicilio. Debido a estos factores, así como a la disponibilidad de la escuela, ITSCO no puede garantizar que el consejero seleccionado sea el más adecuado. Usted tiene el derecho de elegir a su consejero (o el de su hijo/a). En caso de que el consejero que proporcionemos a la escuela de su hijo/a no sea una buena opción, ITSCO le proporcionará referencias y recomendaciones ubicadas fuera de la escuela de su hijo/a, donde ITSCO no puede garantizar disponibilidad.</p>
  <h3>Comentarios/Inquietudes</h3>
  <p>Al firmar este documento, usted acepta, entiende y reconoce lo siguiente:</p>
  <ul>
    <li>ITSCO no es empleado de la escuela, por lo tanto, todos los comentarios o inquietudes deben dirigirse directamente a su consejero o a nuestro personal de ITSCO.</li>
    <li>ITSCO está regulado por DORA, el Departamento de Agencias Regulatorias. La agencia específica dentro del Departamento que tiene la responsabilidad específica sobre psicoterapeutas con y sin licencia es: Department of Regulatory Agencies, Division of Registrations, Mental Health Section, 1560 Broadway, Suite 1350, Denver, Colorado 80202, (303) 894-7800.</li>
    <li>Dado que la información de su hijo/a está protegida bajo la Ley de Portabilidad y Responsabilidad del Seguro Médico (HIPAA), a menos que exista una aprobación específica por escrito del padre o tutor, el director u otro personal administrativo no tendrá acceso a ninguna información sobre el cuidado de su hijo/a. Por lo tanto, dirija todas sus consultas a su consejero o a nuestras oficinas.</li>
  </ul>

  <div class="page-break"></div>

<div class="packet-dense-tight">
  <h2>DERECHOS DEL CLIENTE</h2>
  <h3 class="packet-subhead">Declaración de Divulgación — Parte 1</h3>
  <p>(I) Entiendo que tengo derecho a recibir información sobre los métodos de terapia, las técnicas utilizadas, la duración de la terapia, si se conoce, y la estructura de tarifas.</p>
  <p>(II) Entiendo que puedo buscar una segunda opinión de otro terapeuta o terminar la terapia en cualquier momento.</p>
  <p>(III) Entiendo que en una relación profesional como esta, la intimidad sexual nunca es apropiada y debe reportarse a la junta que otorga la licencia, registro o certificación al titular de la licencia, registro o certificado.</p>
  <p>(IV) Entiendo que la información que proporcioné durante mis sesiones de terapia es legalmente confidencial en el caso de personas con licencia, certificación o registro ante las agencias regulatorias de Colorado, salvo ciertas excepciones legales que serán identificadas por el titular de la licencia, registro o certificado en caso de que surja dicha situación durante la terapia.</p>
  <p>(V) Entiendo que mis expedientes podrían no conservarse por más de siete años, sujeto a cambios en la ley estatal o federal.</p>
  <p><strong>Responsabilidades Regulatorias de Colorado:</strong> El Departamento de Agencias Regulatorias de Colorado tiene la responsabilidad general de regular la práctica de psicólogos con licencia, trabajadores sociales con licencia, consejeros profesionales con licencia, terapeutas matrimoniales y familiares con licencia, trabajadores sociales clínicos con licencia, psicólogos escolares con licencia que ejercen fuera del entorno escolar, y personas sin licencia que practican psicoterapia.</p>
  <h3>Niveles de Regulación Aplicables</h3>
  <p>A continuación se enumeran los niveles de títulos y licencias regulados. Los niveles de regulación aplicables a los profesionales de salud mental varían según los requisitos de experiencia educativa, capacitación y experiencia necesarios para obtener la licencia, registro o certificación específica y particular.</p>
  <ul>
    <li>Un Psicoterapeuta Sin Licencia es un psicoterapeuta que figura en la base de datos del Estado y está autorizado por ley para practicar psicoterapia en Colorado, pero no cuenta con licencia estatal y no está obligado a cumplir con requisitos educativos o de evaluación estandarizados para obtener un registro estatal.</li>
    <li>Un Interno Sin Licencia es un terapeuta a nivel de maestría que debe estar actualmente inscrito como estudiante y recibe entre 2 y 4 horas de supervisión individual y grupal por semana. Está autorizado para practicar psicoterapia en Colorado, pero no tiene licencia ni registro estatal. Su práctica es supervisada y recae bajo la responsabilidad de la licencia de su supervisor principal.</li>
    <li>Un Técnico Certificado en Adicciones (CAT/ACA) debe ser graduado de escuela secundaria o equivalente, completar las horas de capacitación requeridas, 1,000 horas de experiencia supervisada y aprobar el examen NAADAC NCAC Nivel I.</li>
    <li>Un Especialista Certificado en Adicciones (CAS/ACC) debe tener una licenciatura en salud conductual clínica, completar las horas de capacitación requeridas, 3,000 horas de experiencia supervisada (que pueden incluir las horas completadas para el CAT/ACA), y aprobar el examen NAADAC NCAC Nivel II.</li>
    <li>Un Consejero de Adicciones con Licencia (LAC/ACD) debe tener una maestría clínica, cumplir con los requisitos de CAS/ACC o completar 2,000 horas adicionales de experiencia supervisada, y aprobar el examen NAADAC MAC.</li>
    <li>Un Trabajador Social con Licencia debe tener una maestría de una escuela de posgrado en trabajo social y aprobar un examen en trabajo social.</li>
    <li>Un Trabajador Social Clínico con Licencia (LCSW/CSW) debe tener una maestría o doctorado de una escuela de posgrado en trabajo social, ejercer como trabajador social durante al menos dos años, y aprobar un examen en trabajo social.</li>
    <li>Un Candidato a Psicólogo, un Candidato a Terapeuta Matrimonial y Familiar, y un Candidato a Consejero Profesional con Licencia deben contar con el título de licencia necesario y estar en proceso de completar la supervisión requerida para la licencia.</li>
    <li>Un Terapeuta Matrimonial y Familiar con Licencia debe tener una maestría o doctorado en consejería matrimonial y familiar, contar con al menos dos años de práctica posterior a la maestría o un año posterior al doctorado, y aprobar un examen en terapia matrimonial y familiar.</li>
    <li>Un Consejero Profesional con Licencia debe tener una maestría o doctorado en consejería profesional, contar con al menos dos años de práctica posterior a la maestría o un año posterior al doctorado, y aprobar un examen en consejería profesional.</li>
    <li>Un Psicólogo con Licencia debe tener un doctorado en psicología, un año de supervisión posdoctoral, y aprobar un examen en psicología.</li>
  </ul>
  <p>Si su clínico o proveedor figura como "Psicoterapeuta Sin Licencia", esa persona está registrada en la base de datos del estado y autorizada para practicar psicoterapia en Colorado, pero no cuenta con licencia estatal ni está obligada a cumplir con requisitos educativos estandarizados para obtener un registro estatal.</p>
  <p>He leído la información anterior en nuestra Declaración de Divulgación y entiendo mis derechos como cliente o como parte responsable del cliente.</p>
</div>

  <div class="page-break"></div>
<div class="packet-dense">
  <h2>INFORMACIÓN DEL PROFESIONAL DE SALUD MENTAL</h2>
  <h3 class="packet-subhead">Declaración de Divulgación — Parte 2</h3>
  <p>Este documento es obligatorio para todas las profesiones de salud mental en Colorado. La agencia específica dentro del Departamento que tiene la responsabilidad específica sobre psicoterapeutas con y sin licencia es el Department of Regulatory Agencies, Division of Profession and Occupations, Healthcare Professions Programs, cuya junta estatal específica para cada clínico/proveedor se enumera con cada persona, 1560 Broadway, Suite 1350, Denver, Colorado 80202, (303) 894-7800.</p>
  <p>El propósito de este documento es explicar los niveles de regulación aplicables a los profesionales de salud mental bajo la Ley de Práctica de Salud Mental (Mental Health Practice Act) y las diferencias entre licencia, registro y certificación, incluyendo los requisitos educativos, de experiencia y de capacitación aplicables al nivel de regulación en particular. La entidad directa, ITSCO LLC, cubierta por este documento, se detalla a continuación, así como los clínicos y proveedores que son empleados de ITSCO LLC.</p>
  <p>Nota: Los clínicos y proveedores enumerados a continuación están sujetos a cambios. Este documento será enviado, reconocido y firmado por los clientes o su padre/tutor en el momento del ingreso, y se incluirá información precisa sobre su clínico/proveedor específico.</p>
  <p><strong>Entidad Comercial:</strong> ITSCO LLC</p>
  <p><strong>Dirección Comercial:</strong> 437 Windchime Place, Colorado Springs, CO 80919</p>
  <p><strong>Número de Teléfono:</strong> 833-444-8726</p>
  {{DISCLOSURE_CARE_TEAM}}

  <div class="page-break"></div>
  <h2>Política de Privacidad de HIPAA y Aviso de Prácticas de Privacidad</h2>
  <p>The Mental Range Collective (incluyendo ITSCO, Next Level Up, The Inner Strength Institute, PlotTwistCo y MH4kidz)</p>
  <p>ESTE AVISO DESCRIBE CÓMO PUEDE USARSE Y DIVULGARSE LA INFORMACIÓN MÉDICA SOBRE USTED, Y CÓMO PUEDE OBTENER ACCESO A ESTA INFORMACIÓN. POR FAVOR REVÍSELO CUIDADOSAMENTE.</p>
  <h3>Introducción y Nuestro Deber Legal</h3>
  <p>Entendemos que la información sobre su salud mental y atención médica es personal. Estamos comprometidos a proteger la privacidad de su Información de Salud Protegida (PHI) de acuerdo con las leyes federales y de Colorado. Como proveedor de atención médica, estamos obligados por ley a mantener la privacidad de su PHI, proporcionarle este aviso sobre nuestros deberes legales y prácticas de privacidad, y cumplir con los términos de este aviso.</p>
  <p>Este Aviso aplica a ITSCO y a sus proveedores de atención médica autorizados, personal, aprendices y asociados comerciales que apoyan la prestación de su cuidado. Le notificaremos de inmediato si ocurre una violación que pueda comprometer la privacidad o seguridad de su información, según lo exija la ley. También seguimos cualquier ley estatal que proporcione protecciones adicionales más allá de la ley federal.</p>
  <h3>Cómo Podemos Usar y Divulgar su Información de Salud</h3>
  <p>Las siguientes categorías describen las formas en que usamos y divulgamos información de salud sin su autorización por escrito. Para cada categoría, explicamos lo que queremos decir y proporcionamos algunos ejemplos. No se enumerarán todos los usos o divulgaciones, pero todas nuestras prácticas se enmarcan dentro de estas categorías y cumplen con HIPAA y la ley de Colorado aplicable.</p>
  <p><strong>Tratamiento:</strong> Podemos usar y compartir su información de salud para brindar, coordinar o gestionar su cuidado y los servicios relacionados. Esto incluye compartir información, según sea necesario, entre los miembros internos de nuestro equipo. Para la coordinación con profesionales externos (como consejeros escolares o médicos de atención primaria), siempre obtendremos su consentimiento/autorización previa por escrito antes de compartir detalles clínicos.</p>
  <p><strong>Pago:</strong> Podemos usar y divulgar su información de salud para facturar y recibir el pago por los servicios que brindamos. Por ejemplo, podríamos compartir información necesaria con su compañía de seguros para obtener autorización de tratamiento o reembolso de servicios. Esto podría incluir detalles como su diagnóstico, el tratamiento brindado y las fechas de servicio, para que su asegurador pague por el cuidado. Solo compartiremos la información mínima necesaria para fines de facturación. Si usted paga en su totalidad por un servicio o artículo de su propio bolsillo, tiene derecho a solicitarnos que no compartamos esa información con su asegurador de salud para fines de pago u operaciones de atención médica, y honraremos esa solicitud según lo exija la ley.</p>
  <p><strong>Operaciones de Atención Médica:</strong> Podemos usar y divulgar su información para nuestras operaciones de atención médica, es decir, las actividades administrativas, técnicas y de mejora de calidad que nos permiten gestionar nuestra organización y garantizar que todos los clientes reciban atención de calidad. Esto incluye usos y divulgaciones necesarios para la gestión interna y para supervisar la calidad de nuestros servicios. Por ejemplo, podríamos usar su información para evaluar el desempeño de nuestro personal, evaluar la calidad del cuidado que recibió, o aprender cómo podemos mejorar nuestros servicios. También podemos combinar información de muchos clientes para decidir qué servicios adicionales debemos ofrecer, qué servicios no son necesarios, o comparar nuestros resultados con los de otras agencias para fines de garantía de calidad. Al hacerlo, siempre que sea posible, eliminamos la información que identifica a clientes específicos para proteger su privacidad.</p>
  <p><strong>Uso de Tecnología y Herramientas de IA en el Tratamiento y las Operaciones:</strong> Como parte de nuestro tratamiento y operaciones, utilizamos ciertas herramientas digitales seguras, incluidas herramientas impulsadas por inteligencia artificial (IA), para mejorar la precisión y eficiencia de nuestros servicios. Queremos ser transparentes sobre estas herramientas y cómo protegemos su información.</p>
  <p><strong>Documentación de Notas Clínicas (Asistida por IA):</strong> Nuestros clínicos pueden usar software seguro asistido por IA para ayudar a redactar o resumir notas de terapia y otra documentación clínica. Esto significa que utilizamos programas informáticos avanzados para transcribir u organizar información relacionada con su cuidado. Es importante destacar que no incluimos identificadores directos (como su nombre completo o datos de contacto) ni detalles personales innecesarios al usar estas herramientas, de modo que las notas se desidentifican en la medida de lo posible durante su redacción. La herramienta de IA ayuda con la redacción o estructura de la nota, pero su proveedor revisa y finaliza todo el contenido. Una vez finalizada, la nota se ingresa a su expediente de salud electrónico (EHR) oficial, el cual es un sistema seguro. Cualquier dato temporal o borrador creado en la herramienta de IA se elimina de inmediato después de que la nota se transfiere a nuestro EHR. De esta manera, garantizamos que no permanezca información de salud protegida en el sistema de IA más allá de su uso inmediato para la documentación. Todo acceso a la herramienta de documentación de IA está encriptado y es seguro, y solo el personal autorizado puede utilizarla.</p>
  <p><strong>Transcripción de Audio (Con Consentimiento):</strong> Con su consentimiento previo y explícito (o el consentimiento de su padre/tutor para menores), ocasionalmente podemos grabar en audio una sesión de terapia o un resumen clínico hablado para garantizar la precisión en la documentación. Por ejemplo, un terapeuta podría grabar un resumen de la sesión para transcribirlo posteriormente. Si hacemos esto, utilizamos un proceso de transcripción seguro que puede involucrar tecnología de IA para convertir el habla en texto. Solo haremos esto si usted ha otorgado su consentimiento por escrito para dicha grabación. La grabación de audio se utiliza únicamente para crear una nota clínica escrita o un resumen para su expediente. Inmediatamente después de la transcripción y verificación, el archivo de audio y cualquier dato de transcripción fuera de nuestro EHR se eliminan permanentemente. El documento escrito resultante se almacena entonces en su EHR. Tenemos el cuidado de que, incluso durante la transcripción, los datos se manejen de una manera que proteja su identidad; por ejemplo, podemos usar sus iniciales o un sistema de codificación durante el proceso de transcripción en lugar de su nombre completo, especialmente si el servicio de transcripción es una herramienta digital. Cualquier servicio o proveedor de transcripción basado en IA que utilicemos será un Asociado Comercial que cumple con HIPAA y está obligado por contrato a proteger su información. Nunca conservaremos las grabaciones más tiempo del necesario para la transcripción, y nunca usaremos las sesiones grabadas para ningún propósito distinto a la creación de su documentación clínica (a menos que usted proporcione una autorización específica para un uso alternativo).</p>
  <p><strong>Acuerdo de Asociado Comercial:</strong> PlotTwistCo opera como un proveedor de servicios de confianza (asociado comercial) que apoya nuestras operaciones. Mantenemos un Acuerdo de Asociado Comercial (BAA) que les exige proteger su información de acuerdo con HIPAA. Solo pueden usar su información para apoyar la coordinación del cuidado y no tienen permitido usarla para fines independientes, incluyendo mercadeo o comunicación. También están obligados a mantener prácticas de seguridad sólidas y a prevenir cualquier reidentificación de datos desidentificados.</p>
  <p><strong>Coordinación de Cuidado a través de la Aplicación PlotTwistCo:</strong> Utilizamos una aplicación segura de gestión de cuidado proporcionada por PlotTwistCo como parte de la coordinación y mejora de sus servicios. Esta herramienta permite que los proveedores de atención médica autorizados involucrados en su cuidado accedan y compartan temporalmente información médica relevante y planes de cuidado para apoyar un tratamiento coordinado y continuo. Por ejemplo, los miembros de su equipo de atención (como un terapeuta y un gestor de casos) pueden usar esta herramienta para mantenerse alineados sobre sus necesidades y progreso de tratamiento.</p>
  <p><strong>Salvaguardas:</strong> Toda información ingresada o visualizada a través de esta aplicación está protegida con encriptación y controles de seguridad estándar de la industria. La aplicación de PlotTwistCo no reemplaza nuestro expediente de salud electrónico (EHR) principal; se utiliza únicamente como una herramienta de coordinación complementaria. La información compartida a través de este sistema se limita a lo mínimo necesario y se usa de manera temporal y solo en la medida en que se necesite conocer. Por ejemplo, se podría compartir un resumen de metas o una actualización de progreso en lugar de un expediente completo. La información dentro de la aplicación se sincroniza o transfiere de manera rutinaria a nuestro EHR principal en un período breve. Cualquier dato temporal almacenado en la aplicación se elimina o se vuelve inaccesible una vez que ya no es necesario.</p>
  <p><strong>Transferencia de Datos del Portal Escolar (Programa ITSCO):</strong> Si usted está recibiendo servicios basados en la escuela, podemos obtener información relevante de los sistemas escolares o expedientes educativos (como materiales de ingreso o planes educativos) para apoyar su cuidado. Solo accederemos a esta información con la autoridad o el consentimiento adecuado cuando sea necesario. En los casos en que el acceso completo aún no haya sido autorizado, podemos usar temporalmente información de identificación limitada (como iniciales o identificadores internos) únicamente con el fin de emparejar expedientes hasta que se obtenga el consentimiento apropiado. Una vez que la autorización esté en vigor, la información necesaria se transferirá de manera segura a nuestro expediente de salud electrónico (EHR). Cualquier información obtenida de los sistemas escolares se trata como Información de Salud Protegida (PHI) y se protege de acuerdo con las leyes aplicables. Si se requiere un manejo temporal de la información antes de la autorización completa, limitamos los datos utilizados, restringimos el acceso y garantizamos que cualquier dato provisional se elimine de forma segura o se vuelva inaccesible una vez que ya no sea necesario. Todos los procesos utilizados para transferir o manejar esta información están diseñados para minimizar la exposición, utilizar métodos de transmisión seguros y evitar la retención innecesaria de datos.</p>
  <p><strong>Salvaguardas y Privacidad de Datos en los Flujos de Trabajo de IA:</strong> Siempre que utilizamos cualquiera de las herramientas digitales o asistidas por IA mencionadas anteriormente, implementamos salvaguardas rigurosas para proteger su privacidad y derechos. Encriptación: Todos los sistemas y dispositivos electrónicos que utilizamos (incluyendo las herramientas de IA, los servicios de transcripción y la aplicación PlotTwistCo) emplean encriptación en tránsito y en reposo, lo que significa que su información se codifica para que solo las personas autorizadas puedan acceder a ella. Actualizamos continuamente nuestras prácticas de seguridad para cumplir o superar los estándares modernos y abordar las amenazas emergentes de ciberseguridad. Desidentificación: Utilizamos datos desidentificados siempre que sea posible en estos flujos de trabajo. "Desidentificado" significa que la información que razonablemente podría identificarlo (como su nombre, información de contacto u otros identificadores directos) se elimina u oculta, en línea con los estándares de desidentificación de HIPAA. Por ejemplo, una herramienta de IA podría ver "Cliente X" o iniciales en lugar de su nombre, y podría no recibir otros identificadores directos. Según las regulaciones federales, la información que no identifica a una persona (y que razonablemente no puede usarse para identificarla) no se considera información de salud identificable, un estándar que nos esforzamos por alcanzar al usar estas herramientas. Además, cualquier proveedor o servicio que nos asista con IA o procesamiento de datos tiene contractualmente prohibido intentar reidentificar cualquier información desidentificada o usar sus datos para sus propios fines. Controles de Acceso: Solo los miembros autorizados de nuestro personal o nuestros asociados comerciales examinados pueden acceder a las herramientas e información, y solo según sea necesario para sus funciones laborales. Capacitamos a nuestro personal sobre estas prácticas de privacidad y sobre cómo manejar los datos al usar IA, para que comprendan la importancia de no incluir detalles personales innecesarios. Consentimiento y Elección: Cuando se requiera su consentimiento (como para grabaciones de audio o ciertos intercambios de datos), lo obtendremos de manera explícita y por escrito. El uso de estas tecnologías no anulará sus derechos de privacidad; por ejemplo, si prefiere que no usemos una tecnología en particular al manejar su información, tiene derecho a solicitar una restricción (vea "Sus Derechos" a continuación) y atenderemos las solicitudes razonables siempre que sea posible. Transparencia: Queremos que usted esté completamente informado sobre estas prácticas. No dude en hacernos cualquier pregunta sobre nuestro uso de IA u otra tecnología en su cuidado. Nuestro personal está preparado para explicar cómo funcionan estas herramientas para ayudarle en su tratamiento y operaciones, y cómo se protege su información. Creemos que ser transparentes sobre estas herramientas es importante para mantener su confianza. Se le informará si se utilizará alguna tecnología nueva significativa o proceso de IA con su información de salud de una manera que no se describió aquí, y actualizaremos este aviso según sea necesario para reflejar cambios en nuestras prácticas.</p>
  <h3>Otros Usos y Divulgaciones Permitidos o Requeridos por la Ley</h3>
  <p>Podemos usar o divulgar su PHI en ciertas otras situaciones sin su autorización, según lo permita o exija la ley. Por ejemplo:</p>
  <ul>
    <li>Requerido por la Ley: Divulgaremos información de salud sobre usted cuando así lo exija la ley federal, estatal o local.</li>
    <li>Actividades de Salud Pública: Podemos divulgar PHI a autoridades de salud pública autorizadas para recibir dicha información con el fin de prevenir o controlar enfermedades, lesiones o discapacidades.</li>
    <li>Actividades de Supervisión de Salud: Podemos divulgar PHI a agencias gubernamentales o regulatorias que supervisan los sistemas o proveedores de atención médica, para actividades tales como auditorías, inspecciones, licencias o acciones disciplinarias.</li>
    <li>Reportes de Abuso, Negligencia o Violencia Doméstica: Si creemos que usted es víctima de abuso, negligencia o violencia doméstica, podemos divulgar PHI a la autoridad gubernamental correspondiente autorizada para recibir dichos reportes, como una agencia estatal de protección infantil o servicios de protección de adultos, según lo requiera o permita la ley.</li>
    <li>Procedimientos Legales: Podemos divulgar PHI en respuesta a una orden judicial o administrativa, o en respuesta a una citación, solicitud de exhibición de pruebas u otro proceso legal, pero solo si se han realizado esfuerzos para notificarle a usted u obtener una orden de protección, según lo exija la ley.</li>
    <li>Cumplimiento de la Ley: Podemos divulgar PHI a funcionarios encargados de hacer cumplir la ley bajo ciertas circunstancias, incluyendo el reporte de ciertos tipos de heridas o lesiones según lo exija la ley, o en respuesta a una orden judicial válida, orden de arresto o citación.</li>
    <li>Amenazas Graves a la Salud o Seguridad: Podemos usar o divulgar PHI si es necesario para prevenir o disminuir una amenaza grave e inminente a su salud o seguridad, o a la salud o seguridad de otra persona o del público.</li>
    <li>Funciones Gubernamentales Especializadas: Podemos divulgar PHI para ciertas funciones gubernamentales especializadas, tales como actividades militares o de veteranos, actividades de seguridad nacional o inteligencia según lo exija la ley, o para la protección del Presidente y otras personas autorizadas.</li>
    <li>Compensación de Trabajadores: Podemos divulgar información de salud según lo autorizado y en la medida necesaria para cumplir con las leyes relacionadas con la compensación de trabajadores o programas similares que brindan beneficios por lesiones o enfermedades relacionadas con el trabajo.</li>
    <li>Investigación: En algunos casos, podemos usar o compartir su información para investigación en salud. Todos los proyectos de investigación están sujetos a un proceso especial de aprobación.</li>
    <li>Asociados Comerciales: Podemos compartir su información de salud con proveedores de servicios de confianza que realizan servicios en nuestro nombre y que requieren acceso a Información de Salud Protegida.</li>
  </ul>
  <h3>Usos y Divulgaciones que Requieren Su Autorización</h3>
  <p>Por lo general, no usaremos ni divulgaremos su información de salud para ningún propósito no descrito en este aviso, a menos que usted nos otorgue su Autorización por escrito. Si otorga una autorización, puede revocarla en cualquier momento presentando una revocación por escrito, y detendremos el uso o divulgación futura de su información para ese propósito (excepto en la medida en que ya hayamos actuado basándonos en su autorización).</p>
  <ul>
    <li>Notas de Psicoterapia: Las notas registradas (en cualquier medio) por un profesional de salud mental que documenten o analicen el contenido de una sesión de consejería privada, y que estén separadas del resto de su expediente médico, reciben protecciones especiales de privacidad.</li>
    <li>Mercadeo: No usaremos ni divulgaremos su PHI con fines de mercadeo a menos que usted nos otorgue autorización.</li>
    <li>Privacidad de Mensajes de Texto y Comunicación: No compartimos su número de teléfono, el contenido de sus mensajes de texto, ni su consentimiento de participación en SMS con proveedores de servicios de confianza para sus propios fines independientes de comunicación o mercadeo.</li>
    <li>Venta de PHI: Nunca venderemos su información de salud a un tercero sin su autorización explícita.</li>
    <li>Otras Situaciones: Cualquier otro uso o divulgación de su PHI que no se describa en este aviso se realizará únicamente con su autorización por escrito.</li>
  </ul>
  <h3>Protecciones Especiales para Información Sensible</h3>
  <ul>
    <li>Expedientes de Trastorno por Uso de Sustancias: Los expedientes relacionados con el diagnóstico, referencia o tratamiento de uso de sustancias pueden estar protegidos por la ley federal 42 CFR Parte 2.</li>
    <li>Comunicaciones de Salud Mental: La ley de Colorado protege la confidencialidad de las comunicaciones entre los clientes y los profesionales de salud mental.</li>
    <li>Información sobre VIH/SIDA o Enfermedades Transmisibles: La ley de Colorado puede proporcionar protecciones adicionales para la información relacionada con pruebas o tratamiento de VIH/SIDA y cierta información sobre enfermedades transmisibles.</li>
    <li>Información de Salud de Menores: Si usted es menor de 18 años y está autorizado por ley para consentir a ciertos servicios, esos expedientes podrían mantenerse confidenciales frente a los padres o tutores de acuerdo con la ley de Colorado.</li>
  </ul>
  <p>Si una ley (estatal o federal) alguna vez prohíbe o limita sustancialmente un uso o divulgación de PHI que esté permitido bajo HIPAA, seguiremos la ley más protectora. Por el contrario, si otra ley nos exige divulgar información que HIPAA de otro modo nos permitiría abstenernos de divulgar, realizaremos la divulgación según lo requerido.</p>
  <p>Posible Redivulgación: Tenga en cuenta que cuando divulgamos su información de salud a entidades externas, dicha información puede en ocasiones ser redivulgada por el destinatario y podría dejar de estar protegida por la Regla de Privacidad de HIPAA. En ciertos casos, la redivulgación por parte de los destinatarios está estrictamente limitada por la ley, e incluiremos los avisos requeridos al respecto cuando enviemos dicha información.</p>
  <h3>Sus Derechos con Respecto a su Información de Salud</h3>
  <p>Usted tiene los siguientes derechos con respecto a la información de salud que mantenemos sobre usted:</p>
  <ul>
    <li>Derecho a Inspeccionar y Copiar: Tiene derecho a ver y obtener copias de su información de salud que mantenemos en su expediente designado, incluyendo expedientes médicos y de facturación.</li>
    <li>Derecho a Solicitar una Enmienda: Si cree que la información de salud que tenemos sobre usted es incorrecta o incompleta, tiene derecho a solicitar que corrijamos o agreguemos información al expediente.</li>
    <li>Derecho a un Registro de Divulgaciones: Tiene derecho a solicitar una lista (registro) de ciertas divulgaciones de su PHI que hayamos realizado fuera del tratamiento, pago u operaciones de atención médica.</li>
    <li>Derecho a Solicitar Restricciones: Tiene derecho a solicitar que limitemos los usos o divulgaciones de su información de salud para tratamiento, pago u operaciones de atención médica.</li>
    <li>Derecho a Solicitar Comunicaciones Confidenciales: Tiene derecho a solicitar que nos comuniquemos con usted sobre sus asuntos de salud de una manera específica o en un lugar específico para proteger aún más su privacidad.</li>
    <li>Derecho a una Copia Impresa de Este Aviso: Tiene derecho a una copia impresa de este aviso en cualquier momento, incluso si ha aceptado recibirlo electrónicamente.</li>
    <li>Derecho a Ser Notificado de una Violación: Si ocurre una violación de su PHI no asegurada, le notificaremos sin demora injustificada y a más tardar según lo exija la ley.</li>
    <li>Derecho a Retirar su Consentimiento o Excluirse del Uso de IA: En cualquier caso en que dependamos de su consentimiento para usar dicha herramienta, usted tiene derecho a rechazar o retirar ese consentimiento en cualquier momento.</li>
  </ul>
  <h3>Información Adicional y Quejas</h3>
  <p>Cambios a Este Aviso: Nos reservamos el derecho de cambiar los términos de esta Política de Privacidad y Aviso de Prácticas de Privacidad a medida que cambien las leyes o nuestras prácticas. Si realizamos un cambio material, revisaremos este aviso para reflejar dicho cambio.</p>
  <p>Preguntas, Inquietudes o Quejas: Si tiene alguna pregunta sobre este aviso o sobre cómo manejamos su información de salud, por favor contáctenos a través de la información proporcionada a continuación. Si cree que se han violado sus derechos de privacidad, tiene derecho a presentar una queja ante nosotros o directamente ante el Departamento de Salud y Servicios Humanos de EE. UU. (Oficina de Derechos Civiles). No se tomarán represalias ni se le penalizará por presentar una queja.</p>
  <p>Información de Contacto: Oficial de Privacidad, The Mental Range Collective, Michael Mendez, 437 Windchime Place, Colorado Springs, CO, 80919, 833-444-8726, PO@ITSCO.health</p>
  <p>Puede comunicarse con nuestro Oficial de Privacidad con cualquier pregunta sobre este aviso o para ejercer cualquiera de los derechos aquí descritos. Estamos aquí para ayudarle a entender esta política y sus derechos. Si tiene preguntas sobre el uso de herramientas de IA, aplicaciones digitales o cualquier otro aspecto de su privacidad, no dude en comunicarse con nosotros. Con gusto le explicaremos más y nos aseguraremos de que se sienta cómodo/a con la forma en que se maneja su información.</p>
  <p>Fecha de Vigencia de Este Aviso: 4-2-2026 (Este aviso reemplaza cualquier versión anterior. Última revisión el 2-24-2026).</p>
  <p><strong>Versión 1.15</strong></p>
</div>
</section>
`.trim();
