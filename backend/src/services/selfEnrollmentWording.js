/**
 * A student enrolling themselves should not read parent/dependent wording.
 * Replacements are ordered so longer phrases are resolved first.
 */
const keepCase = (replacement) => (match) => (
  /^[A-Z]/.test(match) && replacement ? replacement[0].toUpperCase() + replacement.slice(1) : replacement
);

const RULES = [
  [/you, your family,? or your child\/minor/gi, 'you'],
  [/you, your family/gi, 'you'],
  [/unless there is specific written approval by the parent or guardian/gi, 'unless you provide specific written approval'],
  [/a usted, a su familia o a su hijo\/a\/menor/gi, 'a usted'],
  [/su terapia o la de su hijo\/a\/menor/gi, 'su terapia'],
  [/la información de su hijo\/a/gi, 'su información'],
  [/el cuidado de su hijo\/a/gi, 'su cuidado'],
  [/a menos que exista una aprobación específica por escrito del padre o tutor/gi, 'a menos que usted dé su aprobación específica por escrito'],
  [/\s*\(or your parent\/guardian's consent for minors\)/gi, ''],
  [/\s*\(or their parent\/legal guardian\)/gi, ''],
  [/your or your child's\/minor's/gi, 'your'],
  [/your or your child's/gi, 'your'],
  [/your \(or your child's\)/gi, 'your'],
  [/your \(or your minor's\)/gi, 'your'],
  [/,? or your child\/minor\b/gi, ''],
  [/your child's\/minor's/gi, 'your'],
  [/your minor dependent/gi, 'you'],
  [/aware of their therapy attendance/gi, 'aware of your therapy attendance'],
  [/seeing the dependent with/gi, 'seeing you with'],
  [/the dependent's participation/gi, 'your participation'],
  [/as a client or guardian/gi, 'as a client'],
  [/dependent's (name|sex|grade|date of birth)/gi, null],
  [/your child's/gi, 'your'],
  [/your child\b/gi, 'you'],
  [/your dependent\b/gi, 'you'],
  [/my dependent/gi, 'me']
];

export function rewriteSelfEnrollmentWording(value, { office = false } = {}) {
  const text = RULES.reduce((text, [pattern, replacement]) => text.replace(
    pattern,
    replacement === null ? (_, field) => `Your ${field}` : keepCase(replacement)
  ), String(value || ''));
  if (!office) return text;
  // These known school-policy phrases describe care transitions. Keep their
  // referral/permission meaning while addressing a self-enrolling office client.
  return text
    .replace(/while seeing a counselor within the school/gi, 'while receiving counseling')
    .replace(/outside of the school setting/gi, 'in another care setting')
    .replace(/mientras se atiende con un consejero dentro de la escuela/gi, 'mientras recibe consejería')
    .replace(/fuera del entorno escolar/gi, 'en otro entorno de atención');
}
