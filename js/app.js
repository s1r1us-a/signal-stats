// =====================================================
// SIGNAL CHAT ANALYZER
// =====================================================

const STATE = {
  raw: null,
  account: null,
  selfId: null,
  recipients: new Map(),   // id -> { type, name, color, data }
  chats: new Map(),        // chatId -> { id, recipientId, name, type, messages: [] }
  messages: [],            // all messages, cross-reference
  stickerPacks: new Map(), // packId -> pack meta
  activeChatId: null,      // null = dashboard
  excludedChats: { archived: 0, releaseNotes: 0 },  // archived chats are fully ignored
};

// German + English stopwords
const STOPWORDS = new Set([
  'der','die','das','den','dem','des','ein','eine','einer','eines','einem','einen',
  'und','oder','aber','denn','weil','dass','daß','wenn','als','wie','wo','was','wer',
  'ich','du','er','sie','es','wir','ihr','mir','mich','dir','dich','uns','euch','ihnen','ihm','ihn',
  'mein','dein','sein','unser','euer','meine','deine','seine','meinem','deinem','seinem',
  'ist','bin','bist','sind','seid','war','warst','waren','wart','gewesen','sei','werde','wird','wurde','wurden',
  'hat','habe','haben','hast','hatte','hatten','hätte','hätten',
  'kann','könnte','können','konnte','konnten','muss','müsste','musste','müssen','sollte','sollten','will','wollte','wollten','möchte','mag',
  'auf','in','an','bei','mit','von','zu','zur','zum','für','nach','über','unter','vor','aus','seit','gegen','ohne','durch','wegen','bis',
  'nicht','nein','ja','doch','auch','nur','noch','mal','schon','eben','halt','so','im','am','ans','ins','beim','vom',
  'eins','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn',
  'heute','morgen','gestern','jetzt','dann','immer','nie','hier','dort','da',
  'the','a','and','or','but','of','on','at','to','for','from','with','by','is','are','were','be','been','being',
  'have','has','had','do','does','did','would','could','should','may','might','must','can',
  'i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','its','our','their',
  'this','that','these','those','there','here','where','when','what','who','how','why','which',
  'not','no','yes','if','then','than','as','just','too','very','only','also','even','ever','never','still',
  'ok','okay','joa','joah','jo','naja','hm','hmm','achso','ach','ne','nee','nö','nöö','eig','eigentlich',
  'mehr','weniger','viel','wenig','alles','nichts','etwas','irgendwas','irgendwie',
]);

// ============ UPLOAD HANDLING ============
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const uploadScreen = document.getElementById('upload-screen');
const mainApp = document.getElementById('main-app');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');

uploadZone.addEventListener('click', () => fileInput.click());
document.getElementById('btn-upload-new')?.addEventListener('click', () => fileInput.click());

['dragover','dragenter'].forEach(evt => {
  uploadZone.addEventListener(evt, e => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
});
['dragleave','drop'].forEach(evt => {
  uploadZone.addEventListener(evt, e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
  });
});
uploadZone.addEventListener('drop', e => {
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

function showLoader(text) {
  loaderText.textContent = text;
  loader.classList.add('show');
}
function hideLoader() {
  loader.classList.remove('show');
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

async function handleFile(file) {
  showLoader('Lese Datei...');
  try {
    const text = await file.text();
    showLoader('Parse Backup...');
    await new Promise(r => setTimeout(r, 30));
    parseBackup(text);
    if (STATE.chats.size === 0) {
      throw new Error('Keine Chats gefunden. Ist das eine Signal Desktop Backup-Datei (.jsonl)?');
    }
    if (STATE.messages.length === 0) {
      throw new Error('Chats gefunden, aber keine Nachrichten. Die Datei scheint leer zu sein.');
    }
    showLoader('Baue Statistiken...');
    await new Promise(r => setTimeout(r, 30));
    aggregateAll();
    buildChatList();
    renderDashboard();
    uploadScreen.style.display = 'none';
    mainApp.classList.add('show');
  } catch (err) {
    console.error(err);
    toast('Fehler beim Parsen: ' + err.message);
  } finally {
    hideLoader();
  }
}

// ============ THEME TOGGLE ============
// data-theme wird bereits im <head> (vor dem CSS-Paint) aus localStorage gesetzt,
// um ein Aufblitzen des falschen Themes zu vermeiden. Hier nur das Umschalten.
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('signal-theme', theme); } catch (e) {}
  if (typeof applyChartDefaults === 'function') applyChartDefaults();
  // Charts neu zeichnen, damit sie die neuen Theme-Farben übernehmen
  if (typeof destroyCharts === 'function') destroyCharts();
  if (mainApp.classList.contains('show')) {
    if (STATE.activeChatId) renderChat(STATE.activeChatId);
    else renderDashboard();
  }
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  setTheme(cur === 'dark' ? 'light' : 'dark');
});
