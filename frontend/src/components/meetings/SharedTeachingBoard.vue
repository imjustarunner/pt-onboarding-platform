<template>
  <section class="teaching-board" aria-label="Shared whiteboard">
    <div class="board-bar">
      <template v-if="host"
        ><label
          >Page
          <select :value="boardId" @change="openPage(Number($event.target.value))">
            <option v-for="(b, i) in pages" :key="b.id" :value="b.id">{{ i + 1 }}</option>
          </select></label
        >
        <button type="button" @click="newPage">New page</button>
        <label
          >Background<select
            :value="page.surface"
            aria-label="Board background"
            @change="post('board_surface', { surface: $event.target.value })"
          >
            <option value="dots">Dots</option>
            <option value="blank">Blank</option>
            <option value="lined">Lined</option>
            <option value="grid">Grid</option>
          </select></label
        >
        <button type="button" class="accent" @click="composing = !composing">Insert question</button>
        <button
          type="button"
          :aria-pressed="!page.locked"
          @click="post('board_lock', { locked: !page.locked })"
        >
          {{ page.locked ? 'Unlock student editing' : 'Lock student editing' }}
        </button></template
      >
      <span class="board-status" role="status">{{
        page.locked ? 'View only · Student editing locked' : 'Work together · Student editing on'
      }}</span>
    </div>
    <form v-if="host && composing" class="composer" @submit.prevent="present">
      <label v-if="goals.length"
        >Learning goal<select v-model="goalId" @change="useGoal">
          <option :value="null">General practice</option>
          <option v-for="g in goals" :key="g.id" :value="Number(g.id)">{{ g.title }}</option>
        </select></label
      >
      <label>Skill<input v-model="skill" maxlength="100" placeholder="Equivalent fractions" /></label
      ><label>Grade or level<input v-model="grade" maxlength="30" /></label>
      <label
        >Response<select aria-label="Response" v-model="format">
          <option value="text">Typed answer</option>
          <option value="choice">Multiple choice</option>
          <option value="ink">Handwriting</option>
          <option value="example">Worked example</option>
        </select></label
      >
      <template v-if="generate"
        ><label class="wide"
          >Practice parameters<input
            v-model="parameters"
            maxlength="500"
            placeholder="Use equal-size wholes and denominators under 12" /></label
        ><button type="button" :disabled="generating" @click="draft">
          {{ generating ? 'Generating…' : 'Draft with AI' }}
        </button></template
      >
      <label class="wide"
        >Question or example<textarea v-model="question" required maxlength="1200" rows="2" />
      </label>
      <label v-if="format === 'choice'" class="wide"
        >Choices, one per line<textarea v-model="choices" required rows="3" />
      </label>
      <label
        >Math diagram<select v-model="modelType" aria-label="Math diagram">
          <option value="">None</option>
          <option value="fraction_strip">Fraction strip</option>
          <option value="number_line">Number line</option>
        </select></label
      >
      <template v-if="modelType"
        ><label
          >Equal parts<input type="number" v-model.number="parts" min="2" max="12" required /></label
        ><label
          >{{ modelType === 'fraction_strip' ? 'Shaded parts' : 'Mark at'
          }}<input type="number" v-model.number="mark" min="0" :max="parts" required /></label
      ></template>
      <WorksheetExcerpt
        v-if="host"
        class="wide"
        :materials="materials"
        :read-material="readMaterial"
        @selected="excerpt = $event"
      />
      <p v-if="composerError" class="wide" role="alert">{{ composerError }}</p>
      <button class="accent" type="submit" :disabled="generating || busy">Share on board</button
      ><button type="button" @click="composing = false">Cancel</button>
    </form>
    <div v-if="editable" class="board-bar tools" aria-label="Drawing tools">
      <button v-for="t in tools" :key="t" type="button" :aria-pressed="tool === t" @click="tool = t">
        {{ t }}
      </button>
      <label v-if="tool === 'Pen'"
        >Stroke<select v-model="shape" aria-label="Stroke shape">
          <option value="freehand">Freehand</option>
          <option value="line">Line</option>
          <option value="rectangle">Rectangle</option>
          <option value="ellipse">Ellipse</option>
        </select></label
      >
      <label>Ink <input v-model="ink" type="color" /></label
      ><label
        >Width
        <select v-model.number="width">
          <option v-for="w in [2, 4, 8, 14]" :key="w">{{ w }}</option>
        </select></label
      >
      <button :disabled="!undoItem" @click="visibility(undoItem, false)">Undo</button
      ><button :disabled="!redoItem" @click="visibility(redoItem, true)">Redo</button>
      <button v-if="host" @click="confirmClear = true">Clear page</button>
    </div>
    <div v-if="host && confirmClear" class="board-bar" role="group" aria-label="Confirm clear">
      Clear all ink and questions on this page?<button @click="clear">Clear everything</button
      ><button @click="confirmClear = false">Keep page</button>
    </div>
    <div
      ref="surface"
      class="sheet"
      :data-surface="page.surface"
      :class="{ inking: editable && tool !== 'Select' }"
    >
      <p v-if="!visible.length" class="empty">
        {{
          host ? 'Add a question or draw a worked example.' : 'Your tutor will share the lesson here.'
        }}
      </p>
      <article v-for="item in prompts" :key="item.id" class="question" :style="cardStyle(item)">
        <div class="question-top">
          <span>{{
            item.payload.skill || (item.payload.format === 'example' ? 'Worked example' : 'Practice')
          }}</span
          ><button
            v-if="host"
            class="handle"
            type="button"
            @pointerdown="beginMove($event, item, 'move')"
            @keydown="keyMove($event, item, 'move')"
            aria-label="Move question. Use arrow keys."
          >
            Move
          </button>
        </div>
        <img
          v-if="item.payload.excerpt"
          class="excerpt"
          :src="item.payload.excerpt.image"
          :alt="item.payload.excerpt.label"
        />
        <strong>{{ item.payload.prompt }}</strong>
        <div
          v-if="item.payload.model"
          class="math-model"
          role="img"
          :aria-label="diagramLabel(item.payload.model)"
        >
          <template v-if="item.payload.model.type === 'fraction_strip'"
            ><i
              v-for="n in item.payload.model.parts"
              :key="n"
              :class="{ shaded: n <= item.payload.model.mark }"
          /></template>
          <div v-else class="number-line">
            <span
              v-for="n in item.payload.model.parts + 1"
              :key="n"
              :class="{ marked: n - 1 === item.payload.model.mark }"
              >{{ n - 1 }}</span
            >
          </div>
        </div>
        <template v-if="item.payload.format === 'choice'"
          ><label v-for="option in item.payload.options" :key="option" class="choice"
            ><input
              type="radio"
              :name="'question-' + item.id"
              :value="option"
              v-model="responses[item.id]"
              :disabled="host || !editable"
            />{{ option }}</label
          ></template
        >
        <label v-if="item.payload.format === 'text' && !host"
          >Your answer<input
            v-model="responses[item.id]"
            :disabled="!editable"
            maxlength="2000"
            @focus="activePrompt = item.id"
        /></label>
        <button
          v-if="!host && ['choice', 'text'].includes(item.payload.format)"
          :disabled="!editable || busy || !responses[item.id]?.trim()"
          @click="post('board_answer', { targetId: item.id, answer: responses[item.id] })"
        >
          Submit answer
        </button>
        <button
          v-if="editable && item.payload.format === 'ink'"
          @click="
            activePrompt = item.id;
            tool = 'Pen';
          "
        >
          Write on this question
        </button>
        <label v-if="host && rateActivity" class="rating"
          >Tutor rating<select
            aria-label="Tutor rating"
            :value="page.reviews.get(item.id) || localRatings[item.id] || ''"
            :disabled="!!page.reviews.get(item.id) || !!localRatings[item.id] || reviewing"
            @change="rate(item, $event)"
          >
            <option value="">Choose an observation</option>
            <option value="not_observed">Not assessed</option>
            <option value="needs_review">Needs more practice</option>
            <option value="developing">Solved with support</option>
            <option value="secure">Solved independently</option>
          </select></label
        >
        <small v-if="page.answers.has(item.id)"
          >Submitted · {{ page.answers.get(item.id).payload.answer }}</small
        >
        <button
          v-if="host"
          class="handle resize"
          type="button"
          @pointerdown="beginMove($event, item, 'resize')"
          @keydown="keyMove($event, item, 'resize')"
          aria-label="Resize question. Use arrow keys."
        >
          Resize
        </button>
      </article>
      <svg
        ref="svg"
        viewBox="0 0 1000 700"
        preserveAspectRatio="none"
        aria-label="Ink layer"
        @pointerdown="beginInk"
        @pointermove="moveInk"
        @pointerup="endInk"
        @pointercancel="cancelInk"
      >
        <polyline
          v-for="item in strokes"
          :key="item.id"
          :points="coords(item.payload.points)"
          :stroke="item.payload.color"
          :stroke-width="item.payload.width || 4"
          :opacity="item.payload.highlight ? 0.35 : 1"
          :class="{ erasable: editable && tool === 'Eraser' && (host || item.actor === actor) }"
          @pointerdown.stop="eraseOrDraw($event, item)"
        />
        <polyline
          v-if="line.length"
          :points="coords(line)"
          :stroke="ink"
          :stroke-width="width"
          :opacity="tool === 'Highlight' ? 0.35 : 1"
        />
      </svg>
    </div>
    <p v-if="notify" role="status">{{ notify }}</p>
  </section>
</template>
<script setup>
import { computed, ref, reactive, watch, defineAsyncComponent } from 'vue';
import { teachingPage } from './teachingBoard';
const WorksheetExcerpt = defineAsyncComponent(() => import('./WorksheetExcerpt.vue'));
const props = defineProps({
  boardId: { type: Number, required: true },
  events: { type: Array, required: true },
  host: Boolean,
  actor: String,
  save: { type: Function, required: true },
  generate: Function,
  rateActivity: Function,
  learningContext: Object,
  materials: Array,
  readMaterial: Function,
  busy: Boolean
});
const surface = ref(null),
  svg = ref(null),
  tool = ref('Select'),
  ink = ref('#16314d'),
  width = ref(4),
  line = ref([]),
  activePrompt = ref(null),
  notify = ref(''),
  confirmClear = ref(false);
const composing = ref(false),
  format = ref('text'),
  question = ref(''),
  choices = ref(''),
  goalId = ref(null),
  grade = ref(''),
  skill = ref(''),
  parameters = ref(''),
  excerpt = ref(null),
  generating = ref(false),
  composerError = ref(''),
  responses = reactive({});
const tools = ['Select', 'Pen', 'Highlight', 'Eraser'];
const shape = ref('freehand'),
  modelType = ref(''),
  parts = ref(4),
  mark = ref(2);
const diagramLabel = (m) =>
  m.type === 'fraction_strip'
    ? m.mark + ' shaded out of ' + m.parts + ' equal parts'
    : 'Number line from 0 to ' + m.parts + ' with a mark at ' + m.mark;

const page = computed(() => teachingPage(props.events, props.boardId)),
  editable = computed(() => props.host || !page.value.locked);
const pages = computed(() =>
  props.events.filter((a) => a.type === 'share' && a.payload.mode === 'whiteboard' && !a.payload.boardId)
);
const visible = computed(() => page.value.items.filter((i) => i.visible)),
  strokes = computed(() => visible.value.filter((i) => i.type === 'drawing')),
  prompts = computed(() => visible.value.filter((i) => i.type === 'board_prompt'));
const ownInk = computed(() =>
  page.value.items.filter((i) => i.type === 'drawing' && i.actor === props.actor)
);
const undoItem = computed(() => ownInk.value.filter((i) => i.visible).at(-1));
const redoItem = computed(
  () =>
    ownInk.value
      .filter((i) => !i.visible && i.changedBy === props.actor)
      .sort((a, b) => b.changedAt - a.changedAt)[0]
);
const track = computed(() => props.learningContext?.tracks?.[0]),
  goals = computed(() => track.value?.bundle?.goals || []);
watch(
  () => track.value?.subject?.id,
  () => {
    const t = track.value;
    grade.value = t?.subject?.school_grade || '';
    skill.value = t?.subject?.subject_label || '';
  },
  { immediate: true }
);
function useGoal() {
  skill.value =
    goals.value.find((g) => Number(g.id) === goalId.value)?.title ||
    track.value?.subject?.subject_label ||
    '';
}
const localRatings = reactive({}),
  reviewing = ref(false);
async function rate(item, e) {
  const rating = e.target.value;
  if (!rating) return;
  reviewing.value = true;
  try {
    await props.rateActivity(item.id, rating);
    localRatings[item.id] = rating;
    notify.value = 'Rating added to the session record.';
  } catch (err) {
    e.target.value = '';
    notify.value = err.response?.data?.error?.message || 'Rating could not be saved.';
  } finally {
    reviewing.value = false;
  }
}
const coords = (points) => points.map((p) => p.join(',')).join(' ');
const post = (type, payload) =>
  props.save(type, { shareId: props.boardId, ...payload }, crypto.randomUUID());
const openPage = (id) =>
  props.save(
    'share',
    { mode: 'whiteboard', title: 'Shared whiteboard', boardId: id },
    crypto.randomUUID()
  );
const newPage = () =>
  props.save('share', { mode: 'whiteboard', title: 'Shared whiteboard' }, crypto.randomUUID());
const visibility = (item, visible) => item && post('board_visibility', { targetId: item.id, visible });
async function clear() {
  if (await post('board_clear', {})) confirmClear.value = false;
}
async function draft() {
  generating.value = true;
  composerError.value = '';
  try {
    const d = await props.generate({
      format: format.value,
      grade: grade.value,
      goalId: goalId.value,
      skill: skill.value,
      parameters: parameters.value
    });
    question.value = d.prompt;
    choices.value = (d.options || []).join('\n');
    notify.value = 'Draft ready for your review.';
  } catch (e) {
    composerError.value = e.response?.data?.error?.message || 'Could not generate this question.';
  } finally {
    generating.value = false;
  }
}
async function present() {
  composerError.value = '';
  const options = choices.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    format.value === 'choice' &&
    (options.length < 2 || options.length > 6 || new Set(options).size !== options.length)
  ) {
    composerError.value = 'Enter two to six distinct choices.';
    return;
  }
  const n = prompts.value.length % 4;
  if (
    await post('board_prompt', {
      prompt: question.value,
      format: format.value,
      options,
      ...(modelType.value
        ? { model: { type: modelType.value, parts: parts.value, mark: mark.value } }
        : {}),
      grade: grade.value,
      skill: skill.value,
      goalId: goalId.value,
      excerpt: excerpt.value,
      x: 4 + n * 7,
      y: 5 + n * 10,
      width: 55
    })
  ) {
    question.value = '';
    choices.value = '';
    excerpt.value = null;
    modelType.value = '';
    composing.value = false;
    tool.value = 'Select';
  }
}
let pen = null,
  origin = null;
function pt(e) {
  const box = svg.value.getBoundingClientRect();
  return [
    Math.round(1000 * clamp((e.clientX - box.left) / box.width, 0, 1)),
    Math.round(700 * clamp((e.clientY - box.top) / box.height, 0, 1))
  ];
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function beginInk(e) {
  if (!editable.value || !['Pen', 'Highlight'].includes(tool.value) || pen !== null || e.button !== 0)
    return;
  pen = e.pointerId;
  svg.value.setPointerCapture(pen);
  origin = pt(e);
  line.value = [origin];
}
function moveInk(e) {
  if (pen !== e.pointerId) return;
  const finish = pt(e),
    start = origin;
  if (tool.value !== 'Pen' || shape.value === 'freehand') {
    if (line.value.length < 2000) line.value.push(finish);
    return;
  }
  const [x, y] = start,
    [endX, endY] = finish;
  if (shape.value === 'line') line.value = [start, finish];
  else if (shape.value === 'rectangle') line.value = [start, [endX, y], finish, [x, endY], start];
  else {
    const midX = (x + endX) / 2,
      midY = (y + endY) / 2;
    line.value = Array.from({ length: 49 }, (_, i) => [
      Math.round(midX + (x - midX) * Math.cos((i * Math.PI) / 24)),
      Math.round(midY + (y - midY) * Math.sin((i * Math.PI) / 24))
    ]);
  }
}
function cancelInk() {
  pen = null;
  line.value = [];
}
function endInk(e) {
  if (pen !== e.pointerId) return;
  const points = line.value.slice();
  if (points.length === 1) points.push(points[0]);
  cancelInk();
  void post('drawing', {
    points,
    color: ink.value,
    width: width.value,
    highlight: tool.value === 'Highlight',
    targetId: activePrompt.value || undefined
  });
}
function eraseOrDraw(e, item) {
  if (tool.value === 'Eraser' && editable.value && (props.host || item.actor === props.actor))
    visibility(item, false);
  else beginInk(e);
}
const preview = ref(null);
function cardStyle(item) {
  const p = preview.value?.id === item.id ? preview.value : item.payload;
  return { left: p.x + '%', top: p.y + '%', width: p.width + '%' };
}
function moved(item, mode, dx, dy) {
  const { x, y, width: w } = item.payload;
  return mode === 'move'
    ? { x: clamp(x + dx, 0, 100 - w), y: clamp(y + dy, 0, 94), width: w }
    : { x, y, width: clamp(w + dx, 24, 100 - x) };
}
function keyMove(e, item, mode) {
  const d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key];
  if (!d) return;
  e.preventDefault();
  post('board_move', { targetId: item.id, ...moved(item, mode, ...d) });
}
function beginMove(e, item, mode) {
  if (!props.host || e.button !== 0) return;
  const el = e.currentTarget,
    b = surface.value.getBoundingClientRect(),
    x = e.clientX,
    y = e.clientY;
  el.setPointerCapture(e.pointerId);
  const drag = (ev) => {
    preview.value = {
      id: item.id,
      ...moved(item, mode, (100 * (ev.clientX - x)) / b.width, (100 * (ev.clientY - y)) / b.height)
    };
  };
  const finish = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    el.removeEventListener('pointerup', finish);
    el.removeEventListener('pointermove', drag);
    el.removeEventListener('lostpointercapture', finish);
    if (preview.value && ev.type === 'pointerup') {
      const { x, y, width } = preview.value;
      post('board_move', { targetId: item.id, x, y, width });
    }
    preview.value = null;
  };
  el.addEventListener('pointermove', drag);
  el.addEventListener('pointerup', finish, { once: true });
  el.addEventListener('lostpointercapture', finish, { once: true });
}
watch(
  () => page.value.locked,
  () => {
    if (!editable.value) {
      cancelInk();
      tool.value = 'Select';
    }
  }
);
watch(
  () => visible.value.map((i) => i.id),
  (ids) => {
    if (!ids.includes(activePrompt.value)) activePrompt.value = null;
  }
);
</script>
<style scoped>
.teaching-board {
  color: #152d49;
}
.board-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  padding: 0.4rem 0;
}
.board-bar label,
.choice {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 0.3rem !important;
  margin: 0 !important;
}
.board-bar select,
.board-bar input {
  width: auto !important;
}
.board-bar button,
.board-bar select,
.question button,
.composer button {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.35rem 0.6rem;
  margin: 0;
  border: 1px solid #cad8df;
  border-radius: 6px;
  color: #19334c;
  background: white;
  cursor: pointer;
}
.board-bar [aria-pressed='true'],
button.accent {
  color: white;
  background: #146c64;
}
.board-status {
  margin-left: auto;
  font-size: 0.8rem;
  color: #155e58;
  font-weight: 650;
}
.sheet {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  position: relative;
  isolation: isolate;
  min-height: 340px;
  aspect-ratio: 10/7;
  background-color: #fff;
  background-image: radial-gradient(#d0dee7 1px, transparent 1px);
  background-size: 18px 18px;
  border: 1px solid #cbd9e3;
  border-radius: 10px;
  overflow: auto;
}
.sheet svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  pointer-events: none;
  z-index: 2;
}
.sheet.inking svg {
  pointer-events: auto;
}
.sheet polyline {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
  pointer-events: none;
}
.sheet .erasable {
  pointer-events: stroke;
  cursor: crosshair;
}
.question {
  box-sizing: border-box;
  position: absolute;
  background: #fffffff7;
  border: 1px solid #a7c6cd;
  border-top: 3px solid #19897f;
  border-radius: 8px;
  padding: 0.6rem;
  display: grid;
  gap: 0.35rem;
  overflow-wrap: anywhere;
  max-height: 94%;
  overflow: auto;
  box-shadow: 0 4px 12px #16314d12;
}
.question-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #28665d;
  font-size: 0.75rem;
}
.question .handle {
  cursor: grab;
  touch-action: none;
  font-size: 0.72rem;
  padding: 0.2rem 0.4rem;
}
.question .resize {
  justify-self: end;
}
.question .choice {
  font-size: 0.85rem;
}
.choice input {
  width: auto !important;
}
.question small {
  color: #185e56;
}
.excerpt {
  max-width: 100%;
  max-height: 170px;
  object-fit: contain;
}
.empty {
  position: absolute;
  inset: 35% 10% auto;
  text-align: center;
  color: #617388;
}
.composer {
  border: 1px solid #c7d7dd;
  border-radius: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.5rem;
  padding: 0.75rem;
  margin: 0.4rem 0;
}
.composer label {
  margin: 0 !important;
}
.composer .wide {
  grid-column: 1/-1;
}
.composer textarea,
.composer input,
.composer select {
  width: 100%;
  box-sizing: border-box;
}
.tools {
  border-top: 1px solid #e5ecf0;
}
.sheet[data-surface='blank'] {
  background-image: none;
}
.sheet[data-surface='lined'] {
  background-image: linear-gradient(#dfe7ec 1px, transparent 1px);
  background-size: 100% 24px;
}
.sheet[data-surface='grid'] {
  background-image:
    linear-gradient(#dae4e9 1px, transparent 1px), linear-gradient(90deg, #dae4e9 1px, transparent 1px);
  background-size: 18px 18px;
}
.math-model {
  display: flex;
  align-items: stretch;
  min-height: 22px;
  margin: 4px 0;
}
.math-model i {
  flex: 1;
  border: 1px solid #416e78;
  background: white;
}
.math-model i.shaded {
  background: #4eb3a6;
}
.number-line {
  display: flex;
  width: 100%;
  justify-content: space-between;
  border-top: 2px solid #294f67;
}
.number-line span {
  border-left: 1px solid #294f67;
  font-size: 0.7rem;
  padding: 0.22rem;
}
.number-line .marked {
  color: white;
  background: #196b60;
}
</style>
