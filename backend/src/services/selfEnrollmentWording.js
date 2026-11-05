/**
 * A student enrolling themselves should not read parent/dependent wording.
 * Replacements are ordered so longer phrases are resolved first.
 */
const keepCase = (replacement) => (match) => (
  /^[A-Z]/.test(match) && replacement ? replacement[0].toUpperCase() + replacement.slice(1) : replacement
);

const RULES = [
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

export function rewriteSelfEnrollmentWording(value) {
  return RULES.reduce((text, [pattern, replacement]) => text.replace(
    pattern,
    replacement === null ? (_, field) => `Your ${field}` : keepCase(replacement)
  ), String(value || ''));
}
