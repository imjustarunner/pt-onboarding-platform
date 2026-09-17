import { PDFDocument } from 'pdf-lib';

// Map employee inputs onto the actual widgets in the bundled official PDFs.
// Employer verification fields on I-9 are deliberately outside the employee form.
export async function hireFormDefinitions(bytes, kind) {
  const pdf = await PDFDocument.load(bytes);
  const fields = pdf.getForm().getFields();
  const locate = (name) => {
    const field = fields.find(f => f.getName() === name || f.getName().endsWith(name));
    if (!field) throw new Error(`The ${kind} PDF does not contain expected field ${name}. Check the form edition.`);
    const widget = field.acroField.getWidgets()[0];
    const index = pdf.getPages().findIndex(p => (p.node.Annots()?.asArray() || []).some(ref => pdf.context.lookup(ref) === widget.dict));
    if (index < 0) throw new Error(`Unable to locate ${name} on its form page.`);
    return { ...widget.getRectangle(), page: index + 1, field };
  };
  const input = (name, label = name, options = {}) => {
    const { field, ...rect } = locate(name);
    return { id: name, label, type: 'text', required: false, ...rect, ...options };
  };
  const radio = (id, label, options) => ({ id, label, type: 'radio', required: true,
    options: options.map(([name, label, value]) => { const { field, ...rect } = locate(name); return { label, value: value || name, ...rect }; }) });
  if (kind === 'w4') {
    const labels = ['First name and middle initial', 'Last name', 'Address', 'City, state and ZIP code', 'Social Security number',
      'Step 3(a) · qualifying children credit amount', 'Step 3(b) · other dependents credit amount', 'Step 3 · total credits',
      'Step 4(a) · other income', 'Step 4(b) · deductions', 'Step 4(c) · extra withholding per pay period'];
    return [
      ...labels.map((label, i) => input(`f1_${String(i + 1).padStart(2, '0')}[0]`, label, { required: i < 5, type: i === 4 ? 'ssn' : 'text' })),
      radio('filing_status', 'Step 1(c) · filing status', [['c1_1[0]', 'Single or Married filing separately'], ['c1_1[1]', 'Married filing jointly or Qualifying surviving spouse'], ['c1_1[2]', 'Head of household']]),
      input('c1_2[0]', 'Step 2(c) · two jobs total (review the form instructions)', { type: 'checkbox' }),
      input('c1_3[0]', 'Exempt from withholding · I meet both conditions described on the form', { type: 'checkbox' }),
      { id: 'employee_signature', type: 'signature', label: 'Employee signature', required: true, x: 94, y: 93, width: 335, height: 18, page: 1 },
      { id: 'signature_date', type: 'date', label: 'Date signed', autoToday: true, dateFormat: 'MM/DD/YYYY', x: 475, y: 93, width: 99, height: 18, page: 1 }
    ];
  }
  if (kind === 'direct_deposit') return [
    input('Legal Name', 'Full legal name', { required: true }),
    input('Bank Name', 'Bank name', { required: true }),
    input('Routing', 'Routing number', { required: true, type: 'ssn' }),
    input('Account', 'Account number', { required: true, type: 'ssn' }),
    radio('account_type', 'Account type', [['Acct1_Checking', 'Checking'], ['Acct1_Savings', 'Savings']]),
    input('Acct1_FullNet', 'Deposit my full net pay into this account', { type: 'checkbox', required: true, defaultChecked: true }),
    input('Signature', 'Employee authorization signature', { type: 'signature', required: true }),
    input('Date Signed', 'Date signed', { type: 'date', autoToday: true })
  ];
  if (kind === 'i9') {
    const required = new Set(['Last Name (Family Name)', 'First Name Given Name', 'Address Street Number and Name', 'City or Town', 'State', 'ZIP Code', 'Date of Birth mmddyyyy']);
    const names = [...required, 'Employee Middle Initial (if any)', 'Employee Other Last Names Used (if any)', 'Apt Number (if any)', 'US Social Security Number', 'Employees E-mail Address', 'Telephone Number'];
    return [
      ...names.map(name => {
        const { field } = locate(name);
        return input(name, name, { required: required.has(name), type: name === 'US Social Security Number' ? 'ssn' : name === 'State' ? 'select' : 'text',
          ...(name === 'State' ? { options: field.getOptions().map(value => ({ label: value, value })) } : {}) });
      }),
      radio('citizenship_status', 'Section 1 · attest to your citizenship or immigration status', [['CB_1', 'A citizen of the United States', '1'], ['CB_2', 'A noncitizen national of the United States', '2'], ['CB_3', 'A lawful permanent resident', '3'], ['CB_4', 'An alien authorized to work', '4']]),
      input('3 A lawful permanent resident Enter USCIS or ANumber', 'USCIS / A-number', { required: true, showIf: { fieldId: 'citizenship_status', equals: '3' } }),
      input('Exp Date mmddyyyy', 'Work authorization expiration date (or N/A as instructed)', { required: true, showIf: { fieldId: 'citizenship_status', equals: '4' } }),
      ...['USCIS ANumber', 'Form I94 Admission Number', 'Foreign Passport Number and Country of IssuanceRow1'].map(name => input(name, name, { requiredOneOf: ['USCIS ANumber', 'Form I94 Admission Number', 'Foreign Passport Number and Country of IssuanceRow1'], showIf: { fieldId: 'citizenship_status', equals: '4' } })),
      input('Signature of Employee', 'Employee signature', { type: 'signature', required: true }),
      input("Today's Date mmddyyy", 'Date signed', { type: 'date', autoToday: true, dateFormat: 'MM/DD/YYYY' })
    ];
  }
  if (kind === 'health_election') return [
    { id: 'legal_name', label: 'Full legal name', type: 'text', required: true, x: 79, y: 244, width: 107, height: 14, page: 1 },
    { id: 'provider_name', label: 'Provider name', type: 'text', required: true, x: 149, y: 210, width: 390, height: 15, page: 1 },
    { id: 'election', label: 'Coverage election', type: 'select', required: true, x: null, y: null, options: [{ label: 'Opt in', value: 'in' }, { label: 'Opt out', value: 'out' }] },
    { id: 'initials_in', label: 'Your initials · opt in', type: 'text', required: true, showIf: { fieldId: 'election', equals: 'in' }, x: 319, y: 188, width: 33, height: 14, page: 1 },
    { id: 'initials_out', label: 'Your initials · opt out', type: 'text', required: true, showIf: { fieldId: 'election', equals: 'out' }, x: 400, y: 188, width: 40, height: 14, page: 1 },
    { id: 'employee_signature', label: 'Employee signature', type: 'signature', required: true, x: 120, y: 153, width: 230, height: 18, page: 1 },
    { id: 'signature_date', label: 'Date signed', type: 'date', autoToday: true, x: 389, y: 153, width: 130, height: 18, page: 1 }
  ];
  return [];
}
