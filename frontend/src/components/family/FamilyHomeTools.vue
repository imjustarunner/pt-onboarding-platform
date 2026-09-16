<template>
  <div class="home-tools" :class="{ 'tool-grid': tab==='Home' }">
    <section v-if="['Home','Family'].includes(tab)" class="tool-card decision-card">
      <h2>✧ Let’s pick one</h2><p>Dinner, a movie, or your next adventure. One choice per line.</p>
      <label>Our choices<textarea v-model="choices" rows="4" placeholder="Pizza night&#10;Taco night&#10;Pasta night" maxlength="10000" /></label>
      <div class="tool-actions"><button :disabled="working || choiceOptions.length<2" @click="decide">Pick at random ↻</button><button v-if="isParent" :disabled="working" @click="saveChoices">Save choices</button></div>
      <div v-if="choice" class="decision-result" role="status">{{ choice }}</div>
    </section>
    <section v-if="tab==='Meals'" class="tool-card meal-ideas">
      <h2>✦ A little dinner inspiration</h2><p>Get a fresh AI recipe, save the one you like, and add only the ingredients you need.</p>
      <form @submit.prevent="generate"><label>Cuisine<select v-model="cuisine" class="recipe-cuisine" :disabled="!cuisines.length"><option value="">Any cuisine — surprise me</option><option v-for="item in cuisines" :key="item" :value="item">{{ item }}</option></select></label><label>What sounds good?<textarea v-model="mealPreferences" placeholder="Vegetarian, no mushrooms, use the rice in the pantry…" maxlength="1500" /></label><div class="tool-actions"><label>Servings<input v-model.number="servings" type="number" min="1" max="20" /></label><label>Minutes<input v-model.number="minutes" type="number" min="10" max="180" /></label><button :disabled="working || !cuisines.length">{{ working?'Thinking…':'Surprise me with a recipe' }}</button></div></form>
      <label v-if="savedMeals.length">Filter saved recipes by cuisine<select v-model="savedCuisine" @change="selectedMeal=null"><option value="">All cuisines</option><option v-for="item in cuisines" :key="item" :value="item">{{ item }}</option><option value="uncategorized">Uncategorized</option></select></label><p v-if="savedMeals.length && !filteredSavedMeals.length" class="tool-hint">No saved recipes for this cuisine yet.</p><label v-if="filteredSavedMeals.length">Open a saved recipe<select v-model="selectedMeal" @change="openSaved"><option :value="null">Choose a meal</option><option v-for="m in filteredSavedMeals" :key="m.id" :value="m.id">{{ m.title }}</option></select></label>
      <article v-if="recipe" class="recipe"><h3>{{ recipe.title }}</h3><p>{{ recipe.description }}</p><p><span v-if="recipe.cuisine">{{ recipe.cuisine }} · </span>{{ recipe.servings }} servings · About {{ recipe.minutes }} minutes</p><h4>What you’ll need</h4><label v-for="(item,index) in recipe.ingredients" :key="index" class="check-label"><input v-model="selectedIngredients" type="checkbox" :value="index" /><span>{{ item.quantity }} {{ item.name }}</span></label><h4>Let’s make it</h4><ol><li v-for="(step,index) in recipe.steps" :key="index">{{ step }}</li></ol><div class="tool-actions"><button :disabled="working || !!savedId" @click="saveRecipe">{{ savedId?'Saved to meals ✓':'Save this recipe' }}</button><label>Add to<select v-model="listKind"><option value="grocery">Grocery list</option><option value="shopping">Shopping list</option></select></label><button :disabled="working || !selectedIngredients.length" @click="addIngredients">＋ Add ingredients</button></div><p class="tool-hint">Uncheck anything you already have. Adding ingredients also saves this recipe.</p></article>
    </section>
    <section v-if="tab==='Meals'" class="tool-card takeout-picker">
      <h2>🥡 Takeout tonight?</h2><p>Pick a cuisine at random. Include everything or narrow it to what sounds good.</p>
      <details><summary>Choose cuisines · {{ takeoutCuisines.length }} selected</summary><div class="tool-actions"><button type="button" :disabled="working" @click="takeoutCuisines=[...cuisines]">Select all</button><button type="button" :disabled="working" @click="takeoutCuisines=[]">Clear choices</button></div><div class="cuisine-choices"><label v-for="item in cuisines" :key="item" class="check-label"><input v-model="takeoutCuisines" type="checkbox" :value="item" :disabled="working" />{{ item }}</label></div></details>
      <button class="takeout-random" :disabled="working || !takeoutCuisines.length" @click="pickTakeout">↻ Pick takeout at random</button><p v-if="!takeoutCuisines.length" class="tool-hint">Choose at least one cuisine above.</p>
      <div v-if="takeoutChoice" class="decision-result takeout-result" role="status"><small>Tonight’s takeout pick</small>{{ takeoutChoice }}</div>
    </section>
    <section v-if="tab==='Settings' && isParent" class="tool-card">
      <h2>▧ Family photo frame</h2><p>Your own photos, filling the screen when the dashboard is idle. Tap anywhere to return.</p>
      <form @submit.prevent="savePreferences"><label class="check-label"><input v-model="preferences.screensaverEnabled" type="checkbox" /> Turn on the photo screensaver</label><div class="tool-actions"><label>Start after<select v-model.number="preferences.idleMinutes"><option v-for="n in [1,2,5,10,15,30]" :key="n" :value="n">{{ n }} minutes</option></select></label><label>Change photo every<select v-model.number="preferences.slideSeconds"><option v-for="n in [5,10,15,30,60]" :key="n" :value="n">{{ n }} seconds</option></select></label></div><label class="check-label"><input v-model="preferences.showClock" type="checkbox" /> Show the clock and next event</label><div class="tool-actions"><button :disabled="working">Save photo settings</button><button type="button" :disabled="!photos.length" @click="startFrame">Preview slideshow</button></div></form>
      <label class="photo-upload">Add photos ({{ photos.length }}/50)<input type="file" accept="image/jpeg,image/png,image/webp" multiple :disabled="working" @change="uploadPhotos" /></label><p class="tool-hint">Photos are resized for the display and shared only inside your household. Export HEIC photos as JPEG first.</p>
      <div class="photo-grid"><div v-for="photo in photos" :key="photo.id"><img :src="photoUrl(photo.id)" :alt="photo.caption || 'Family album photo'" loading="lazy" /><button :disabled="working" :aria-label="'Remove photo '+photo.id" @click="removePhoto(photo.id)">Remove</button></div></div>
    </section>
    <p v-if="message" class="tool-message" role="status">{{ message }}</p>
  </div>
  <Teleport to="body"><button v-if="frameActive && currentPhoto && !suspended" class="family-photo-frame" aria-label="Return to family dashboard" @pointerdown.prevent="dismissFrame" @keydown="dismissFrame"><img :src="photoUrl(currentPhoto.id)" :alt="currentPhoto.caption || 'Family photo'" /><span v-if="preferences.showClock" class="frame-caption"><strong>{{ time }}</strong><span>{{ upcoming ? 'Up next · '+upcoming : 'A little more together.' }}</span></span><span class="frame-return">Tap to return</span></button></Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { resizeFamilyPhoto } from '../../utils/familyPhotos';
const props=defineProps({http:{type:Function,required:true},householdId:{type:[Number,String],required:true},tab:String,isParent:Boolean,suspended:Boolean,time:String,upcoming:String,meals:{type:Array,default:()=>[]}});
const emit=defineEmits(['updated','error']);
const preferences=ref({screensaverEnabled:false,idleMinutes:5,slideSeconds:15,showClock:true,decisionOptions:[]}),photos=ref([]),choices=ref(''),choice=ref(''),working=ref(false),message=ref('');
const cuisines=ref([]),cuisine=ref(''),savedCuisine=ref(''),takeoutCuisines=ref([]),takeoutChoice=ref('');
const mealPreferences=ref(''),servings=ref(4),minutes=ref(30),recipe=ref(null),savedId=ref(null),selectedMeal=ref(null),selectedIngredients=ref([]),listKind=ref('grocery');
const frameActive=ref(false),photoIndex=ref(0),currentPhoto=computed(()=>photos.value[photoIndex.value%Math.max(1,photos.value.length)]);
const choiceOptions=computed(()=>[...new Set(choices.value.split('\n').map(s=>s.trim()).filter(Boolean))]);
const savedMeals=computed(()=>props.meals.filter(m=>m.metadata?.recipe));
const filteredSavedMeals=computed(()=>savedMeals.value.filter(m=>!savedCuisine.value || (savedCuisine.value==='uncategorized' ? !m.metadata.recipe.cuisine : m.metadata.recipe.cuisine===savedCuisine.value)));
const path=()=>`/households/${props.householdId}`;
const photoUrl=id=>`/api/family${path()}/photos/${id}`;
let lastActivity=Date.now(),lastSlide=Date.now(),timer,albumTimer,previousFocus;
async function run(fn){if(working.value)return;working.value=true;message.value='';try{await fn();}catch(e){emit('error',e);}finally{working.value=false;lastActivity=Date.now();}}
async function load(){const{data}=await props.http.get(`${path()}/tools`);preferences.value={...preferences.value,...data.preferences};photos.value=data.photos;if(!cuisines.value.length){cuisines.value=data.cuisines || [];takeoutCuisines.value=[...cuisines.value];}choices.value=(preferences.value.decisionOptions||[]).join('\n');}
async function decide(){await run(async()=>{choice.value=(await props.http.post(`${path()}/decide`,{options:choiceOptions.value})).data.choice;});}
async function persist(){preferences.value=(await props.http.put(`${path()}/preferences`,preferences.value)).data;message.value='Saved for your household.';}
async function savePreferences(){await run(persist);}
async function saveChoices(){await run(async()=>{preferences.value.decisionOptions=choiceOptions.value;await persist();});}
function setRecipe(value,id=null){recipe.value=value;savedId.value=id;selectedIngredients.value=value.ingredients.map((_,i)=>i);}
async function generate(){await run(async()=>{const{data}=await props.http.post(`${path()}/recipes/generate`,{cuisine:cuisine.value,preferences:mealPreferences.value,servings:servings.value,minutes:minutes.value});setRecipe(data.recipe);selectedMeal.value=null;});}
async function pickTakeout(){await run(async()=>{takeoutChoice.value=(await props.http.post(`${path()}/takeout/choose`,{cuisines:takeoutCuisines.value})).data.cuisine;});}
watch(takeoutCuisines,()=>{takeoutChoice.value='';},{deep:true});
function openSaved(){const meal=savedMeals.value.find(m=>m.id===selectedMeal.value);if(meal)setRecipe(meal.metadata.recipe,meal.id);}
async function persistRecipe(){if(!savedId.value){savedId.value=(await props.http.post(`${path()}/recipes`,{recipe:recipe.value})).data.id;emit('updated');}}
async function saveRecipe(){await run(async()=>{await persistRecipe();message.value='Recipe saved. You can open it from Meals any time.';});}
async function addIngredients(){await run(async()=>{await persistRecipe();const{data}=await props.http.post(`${path()}/recipes/${savedId.value}/ingredients`,{ingredientIndexes:selectedIngredients.value,listKind:listKind.value});message.value=`${data.added} ingredients added${data.skipped?`; ${data.skipped} already added`:''}.`;emit('updated');});}
async function uploadPhotos(event){const files=[...(event.target.files||[])];event.target.value='';await run(async()=>{try{for(const file of files){await props.http.post(`${path()}/photos`,{image:await resizeFamilyPhoto(file)});}}finally{await load();}message.value='Your photos are ready.';});}
async function removePhoto(id){await run(async()=>{await props.http.delete(`${path()}/photos/${id}`);photos.value=photos.value.filter(p=>p.id!==id);});}
function startFrame(){previousFocus=document.activeElement;photoIndex.value=0;lastSlide=Date.now();frameActive.value=true;nextTick(()=>document.querySelector('.family-photo-frame')?.focus());}
function dismissFrame(){frameActive.value=false;lastActivity=Date.now();previousFocus?.focus?.();}
function activity(){if(!frameActive.value)lastActivity=Date.now();}
watch(()=>props.suspended,value=>{if(value)dismissFrame();});
onMounted(async()=>{try{await load();}catch(e){emit('error',e);}for(const name of ['pointerdown','keydown','touchstart','pointermove'])document.addEventListener(name,activity,{passive:true});timer=setInterval(()=>{if(document.hidden||props.suspended||working.value){lastActivity=Date.now();return;}if(!photos.value.length){frameActive.value=false;return;}if(!frameActive.value&&preferences.value.screensaverEnabled&&Date.now()-lastActivity>=preferences.value.idleMinutes*60000)startFrame();if(frameActive.value&&Date.now()-lastSlide>=preferences.value.slideSeconds*1000){photoIndex.value++;lastSlide=Date.now();}},1000);});
onMounted(()=>{albumTimer=setInterval(async()=>{if(document.hidden||working.value||props.tab==='Settings')return;try{const{data}=await props.http.get(`${path()}/tools`);photos.value=data.photos;preferences.value={...preferences.value,...data.preferences};}catch(e){if([401,403].includes(e.response?.status))dismissFrame();}},60000);});
onUnmounted(()=>{clearInterval(timer);clearInterval(albumTimer);for(const name of ['pointerdown','keydown','touchstart','pointermove'])document.removeEventListener(name,activity);});
</script>

<style scoped>
.takeout-picker summary{cursor:pointer;padding:12px 0;font-size:13px}
.cuisine-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 16px;margin:12px 0}
.takeout-random{margin-top:16px}
.takeout-result small{display:block;font-size:13px;margin-bottom:8px}


.home-tools{margin-top:22px}
.home-tools:empty{display:none}
.tool-grid{max-width:650px}
.tool-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px;margin-bottom:20px;max-width:850px;color:var(--ink)}
.tool-card h2{font-size:18px;color:var(--purple);margin:0 0 12px}
.tool-card p{font-size:13px;line-height:1.6;margin:12px 0}
.tool-card label{display:flex;flex-direction:column;gap:7px;font-size:13px;margin:12px 0}
.tool-card input,.tool-card textarea,.tool-card select{font:inherit;border:1px solid var(--control);border-radius:9px;padding:11px;width:100%;background:var(--surface);color:var(--ink)}
.tool-card textarea{resize:vertical;min-height:90px}
.tool-card button{font:inherit;border:1px solid var(--control);border-radius:9px;background:var(--soft);color:var(--purple);padding:10px 14px;cursor:pointer}
.tool-card button:disabled{opacity:.5;cursor:default}
.tool-card button:focus-visible{outline:3px solid var(--purple)}
.tool-actions{display:flex;gap:12px;flex-wrap:wrap;align-items:end}
.tool-actions>label{flex:1;min-width:100px;margin:0}
.tool-actions>button{min-height:43px}
.tool-card .check-label{flex-direction:row;align-items:center;gap:10px}
.check-label input{width:18px;height:18px;min-height:18px;accent-color:#8b78b5}
.decision-result{font-size:26px;text-align:center;background:#f6f1e6;padding:20px;border-radius:12px;margin-top:18px;overflow-wrap:anywhere}
.recipe{border-top:1px solid var(--line);margin-top:22px;padding-top:20px}
.recipe h3{font-size:24px;margin:0}
.recipe h4{margin:22px 0 12px}
.recipe li{font-size:13px;line-height:1.8;margin:8px 0}
.tool-card .tool-hint{font-size:13px;color:var(--muted)}
.tool-message{font-size:13px;color:#35754c;grid-column:1/-1}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-top:16px}
.photo-grid img{width:100%;height:100px;object-fit:cover;border-radius:10px}
.photo-grid button{width:100%;font-size:13px}
.family-photo-frame{position:fixed;inset:0;z-index:12000;width:100vw;height:100dvh;background:#101117;border:0;padding:0;cursor:pointer;color:white;text-align:left}
.family-photo-frame>img{width:100%;height:100%;object-fit:contain}
.frame-caption{position:absolute;left:0;right:0;bottom:0;padding:80px 5vw 60px;background:linear-gradient(transparent,#0009);display:flex;flex-direction:column;gap:10px;font-family:'Avenir Next',sans-serif}
.frame-caption strong{font-size:clamp(42px,8vw,110px);font-weight:500}
.frame-caption>span{font-size:clamp(14px,2vw,24px)}
.frame-return{position:absolute;right:25px;bottom:20px;font:12px sans-serif;color:#fff}
.meal-ideas{max-width:900px}

</style>
