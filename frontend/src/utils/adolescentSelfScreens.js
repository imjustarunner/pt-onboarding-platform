const frequency = [
  { value: '0', label: 'Not at all' },
  { value: '1', label: 'Several days' },
  { value: '2', label: 'More than half the days' },
  { value: '3', label: 'Nearly every day' }
];

function item(key, label, helperText, instrument, section) {
  return {
    id: `field_${key}`,
    key,
    label,
    type: 'radio',
    required: true,
    helperText,
    options: frequency,
    instrument,
    section,
    scope: 'self',
    category: 'clinical'
  };
}

const phqAHelper = 'Over the last 2 weeks, how often have you been bothered by any of the following problems?';
const gadHelper = 'Over the last 2 weeks, how often have you been bothered by the following problems?';

/** Same adolescent wording as the measure library. Used when the packet has no self screens yet. */
export function adolescentSelfScreenFields() {
  return [
    item('phqa_1', 'Feeling down, depressed, irritable, or hopeless', phqAHelper, 'phqa', 'PHQ-A'),
    item('phqa_2', 'Little interest or pleasure in doing things', phqAHelper, 'phqa', 'PHQ-A'),
    item('phqa_3', 'Trouble falling asleep, staying asleep, or sleeping too much', phqAHelper, 'phqa', 'PHQ-A'),
    item('phqa_4', 'Poor appetite, weight loss, or overeating', phqAHelper, 'phqa', 'PHQ-A'),
    item('phqa_5', 'Feeling tired, or having little energy', phqAHelper, 'phqa', 'PHQ-A'),
    item('phqa_6', 'Feeling bad about yourself — or that you are a failure, or that you have let yourself or your family down', phqAHelper, 'phqa', 'PHQ-A'),
    item('phqa_7', 'Trouble concentrating on things like school work, reading, or watching TV', phqAHelper, 'phqa', 'PHQ-A'),
    item('phqa_8', 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual', phqAHelper, 'phqa', 'PHQ-A'),
    item('phqa_9', 'Thoughts that you would be better off dead, or of hurting yourself in some way', phqAHelper, 'phqa', 'PHQ-A'),
    item('gad7_1', 'Feeling nervous, anxious, or on edge', gadHelper, 'gad7', 'GAD-7'),
    item('gad7_2', 'Not being able to stop or control worrying', gadHelper, 'gad7', 'GAD-7'),
    item('gad7_3', 'Worrying too much about different things', gadHelper, 'gad7', 'GAD-7'),
    item('gad7_4', 'Trouble relaxing', gadHelper, 'gad7', 'GAD-7'),
    item('gad7_5', 'Being so restless that it is hard to sit still', gadHelper, 'gad7', 'GAD-7'),
    item('gad7_6', 'Becoming easily annoyed or irritable', gadHelper, 'gad7', 'GAD-7'),
    item('gad7_7', 'Feeling afraid, as if something awful might happen', gadHelper, 'gad7', 'GAD-7')
  ];
}
