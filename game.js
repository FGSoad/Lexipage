// ============================================================
//  LEXIPAGE — game.js
//  Mots : /french_clean.txt (dans le repo)
//  Définitions : Wiktionnaire
// ============================================================

const DEBUG_DATE = null;

function dateSeed() {
  const today = DEBUG_DATE ? new Date(DEBUG_DATE) : new Date();
  return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

function seededRng(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ============================================================
//  FETCH HELPERS
// ============================================================
async function fetchWithTimeout(url, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ============================================================
//  CHARGEMENT DE LA LISTE DE MOTS
// ============================================================
async function loadWordList() {
  const resp = await fetchWithTimeout('/french_clean.txt', 15000);
  const text = await resp.text();
  const words = text.split('\n')
    .map(w => w.trim().toUpperCase())
    .filter(w => w.length >= 3)
    .filter(w => /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇŒÆ]+$/.test(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
  console.log('Wordlist chargée :', words.length, 'mots');
  return words;
}

// ============================================================
//  WIKTIONARY — définitions uniquement
// ============================================================
async function fetchDefinition(word) {
  const url = `https://fr.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word.toLowerCase())}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`;
  try {
    const resp = await fetchWithTimeout(url, 8000);
    const data = await resp.json();
    const pages = data.query.pages;
    const page = Object.values(pages)[0];
    if (!page.revisions) return null;
    const wikitext = page.revisions[0].slots.main['*'];
    const sections = wikitext.split(/(?=== \{\{langue\|)/);
    const frSection = sections.find(s => s.startsWith('== {{langue|fr}}'));
    if (!frSection) return null;
    let grammar = '—';
    if (/\{\{S\|nom/.test(frSection)) grammar = 'n.';
    else if (/\{\{S\|verbe/.test(frSection)) grammar = 'v.';
    else if (/\{\{S\|adjectif/.test(frSection)) grammar = 'adj.';
    else if (/\{\{S\|adverbe/.test(frSection)) grammar = 'adv.';
    else if (/\{\{S\|pronom/.test(frSection)) grammar = 'pron.';
    else if (/\{\{S\|préposition/.test(frSection)) grammar = 'prép.';
    const defLine = frSection.split('\n').find(l => /^# [^#*:;]/.test(l));
    if (!defLine) return null;
    let def = defLine.replace(/^# /, '');
    def = def.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2');
    def = def.replace(/\{\{[^}]+\}\}/g, '');
    def = def.replace(/'{2,3}/g, '');
    def = def.replace(/<[^>]+>/g, '');
    def = def.replace(/\s+/g, ' ').trim();
    if (def) def = def.charAt(0).toUpperCase() + def.slice(1);
    if (def && !def.endsWith('.')) def += '.';
    if (!def || def.length < 8 || def.length > 250) return null;
    return { grammar, definition: def };
  } catch (e) {
    return null;
  }
}

// ============================================================
//  PUZZLE GENERATION
// ============================================================
let PUZZLE = null;

async function generatePuzzle() {
  try {
    await _generatePuzzleInner();
  } catch(e) {
    console.warn('generatePuzzle failed, fallback:', e);
    useFallback();
  }
}

async function _generatePuzzleInner() {
  setLoadingMsg('Chargement du dictionnaire…');

  let allWords;
  try {
    allWords = await loadWordList();
  } catch(e) {
    console.warn('Impossible de charger la liste:', e);
    useFallback();
    return;
  }

  if (allWords.length < 30) {
    console.warn('Liste trop courte:', allWords.length);
    useFallback();
    return;
  }

  // Trier alphabétiquement
  allWords.sort((a, b) => a.localeCompare(b, 'fr'));

  const seed = dateSeed();
  const rng = seededRng(seed);

  // Tirer un index aléatoire entre 0 et (total - 30)
  // pour garantir qu'on a toujours 30 mots consécutifs
  const maxStart = allWords.length - 30;
  const startIdx = Math.floor(rng() * maxStart);
  const slice = allWords.slice(startIdx, startIdx + 30);

  console.log('Page du jour :', slice[0], '→', slice[slice.length - 1]);
  setLoadingMsg(`Page : ${slice[0]} — ${slice[slice.length - 1]}`);

  setLoadingMsg('Récupération des définitions…');

  // Fetch les définitions pour les 30 mots consécutifs
  const results = [];
  for (let i = 0; i < slice.length; i++) {
    const w = slice[i];
    setLoadingMsg(`Définitions… ${i + 1}/${slice.length}`);
    const def = await fetchDefinition(w);
    console.log(w, '->', def ? 'ok' : 'null');
    results.push({
      word: w,
      grammar: def ? def.grammar : '—',
      definition: def ? def.definition : null,
      letters: w.length,
      hasDefinition: !!def,
    });
    if (i < slice.length - 1) await sleep(80);
  }

  const today = DEBUG_DATE ? DEBUG_DATE : new Date().toISOString().split('T')[0];
  PUZZLE = { date: today, words: results };
  startGame();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setLoadingMsg(msg) {
  const el = document.getElementById('loadingMsg');
  if (el) el.textContent = msg;
}

// ============================================================
//  FALLBACK
// ============================================================
function useFallback() {
  const seed = dateSeed();

  const POOL = [
    { word: "ABSINTHE", grammar: "n. f.", definition: "Plante aromatique amère ; liqueur alcoolisée d'une couleur verte caractéristique.", hasDefinition: true },
    { word: "ACAJOU", grammar: "n. m.", definition: "Arbre tropical à bois rougeâtre précieux, utilisé en ébénisterie.", hasDefinition: true },
    { word: "ACRIMONIE", grammar: "n. f.", definition: "Mauvaise humeur qui se manifeste par des paroles blessantes.", hasDefinition: true },
    { word: "AFFABLE", grammar: "adj.", definition: "Qui accueille autrui avec bienveillance et douceur.", hasDefinition: true },
    { word: "ALAMBIC", grammar: "n. m.", definition: "Appareil servant à distiller les liquides alcoolisés.", hasDefinition: true },
    { word: "ALGÈBRE", grammar: "n. f.", definition: "Branche des mathématiques qui généralise l'arithmétique par l'usage de symboles.", hasDefinition: true },
    { word: "ALTRUISTE", grammar: "adj.", definition: "Qui se soucie du bien d'autrui avant le sien propre.", hasDefinition: true },
    { word: "AMULETTE", grammar: "n. f.", definition: "Petit objet que l'on porte sur soi comme protection contre le mauvais sort.", hasDefinition: true },
    { word: "ANCOLIE", grammar: "n. f.", definition: "Plante ornementale aux fleurs en forme d'éperons, souvent bleues ou violettes.", hasDefinition: true },
    { word: "ANTILOPE", grammar: "n. f.", definition: "Mammifère ruminant aux longues cornes, vivant principalement en Afrique.", hasDefinition: true },
    { word: "APOGÉE", grammar: "n. m.", definition: "Point le plus élevé d'une trajectoire ; moment de plus grande gloire.", hasDefinition: true },
    { word: "ARDOISE", grammar: "n. f.", definition: "Roche schisteuse gris-bleu utilisée pour couvrir les toits ou écrire.", hasDefinition: true },
    { word: "BAROQUE", grammar: "adj.", definition: "D'une fantaisie ornementale exubérante ; qui surprend par son irrégularité.", hasDefinition: true },
    { word: "BASALTE", grammar: "n. m.", definition: "Roche volcanique noire ou gris sombre, très dure et dense.", hasDefinition: true },
    { word: "BÉATITUDE", grammar: "n. f.", definition: "Bonheur parfait et serein, état de félicité absolue.", hasDefinition: true },
    { word: "BELVÉDÈRE", grammar: "n. m.", definition: "Construction ou terrasse offrant un beau point de vue sur le paysage.", hasDefinition: true },
    { word: "BESTIAIRE", grammar: "n. m.", definition: "Recueil médiéval de descriptions allégoriques d'animaux réels ou fabuleux.", hasDefinition: true },
    { word: "BIVOUAC", grammar: "n. m.", definition: "Campement provisoire en plein air, sans tentes, utilisé par des soldats ou randonneurs.", hasDefinition: true },
    { word: "CHIMÈRE", grammar: "n. f.", definition: "Monstre fabuleux ; idée ou projet irréalisable, illusion vaine.", hasDefinition: true },
    { word: "CITADELLE", grammar: "n. f.", definition: "Forteresse dominant une ville et servant à la défendre ou à la contrôler.", hasDefinition: true },
    { word: "CLAVECIN", grammar: "n. m.", definition: "Instrument de musique à clavier dont les cordes sont pincées mécaniquement.", hasDefinition: true },
    { word: "CRÉPUSCULE", grammar: "n. m.", definition: "Lumière diffuse qui précède le lever ou suit le coucher du soleil.", hasDefinition: true },
    { word: "CRYPTE", grammar: "n. f.", definition: "Caveau souterrain aménagé sous une église pour servir de lieu de sépulture.", hasDefinition: true },
    { word: "DAUPHIN", grammar: "n. m.", definition: "Mammifère marin cétacé très intelligent, réputé pour ses sauts acrobatiques.", hasDefinition: true },
    { word: "DÉBÂCLE", grammar: "n. f.", definition: "Rupture soudaine des glaces sur un cours d'eau ; effondrement complet.", hasDefinition: true },
    { word: "DÉDALE", grammar: "n. m.", definition: "Labyrinthe ; ensemble très compliqué et inextricable de rues ou de chemins.", hasDefinition: true },
    { word: "DOLMEN", grammar: "n. m.", definition: "Monument mégalithique formé de grandes pierres plates posées sur des blocs dressés.", hasDefinition: true },
    { word: "DRAKKAR", grammar: "n. m.", definition: "Navire viking à fond plat, propulsé à la voile et à la rame.", hasDefinition: true },
    { word: "ÉCLIPSE", grammar: "n. f.", definition: "Disparition temporaire d'un astre occulté par un autre ; absence remarquée.", hasDefinition: true },
    { word: "EMBARGO", grammar: "n. m.", definition: "Interdiction officielle de commercer avec un pays ou d'exporter certains biens.", hasDefinition: true },
  ];

  POOL.sort((a, b) => a.word.localeCompare(b.word, 'fr'));
  const rng = seededRng(seed);
  const maxIdx = Math.max(0, POOL.length - 30);
  const startIdx = Math.floor(rng() * maxIdx);
  const selected = POOL.slice(startIdx, startIdx + 30);

  const today = DEBUG_DATE ? DEBUG_DATE : new Date().toISOString().split('T')[0];
  PUZZLE = { date: today, words: selected, fallback: true };
  startGame();
}

// ============================================================
//  STATE
// ============================================================
const state = {
  guesses: 0,
  hintsUsed: 0,
  found: new Set(),
  hintRevealed: new Set(),
  total: 0,
};

// ============================================================
//  START GAME
// ============================================================
function startGame() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 600);

  const d = new Date(PUZZLE.date + 'T12:00:00');
  document.getElementById('todayDate').textContent =
    d.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });

  const first = PUZZLE.words[0].word;
  const last = PUZZLE.words[PUZZLE.words.length - 1].word;
  document.getElementById('pageRange').textContent = `${first} — ${last}`;

  // Total = tous les mots sauf premier et dernier (les ancres)
  state.total = PUZZLE.words.length - 2;
  updateProgress();
  renderWords();
  setupInput();

  if (PUZZLE.fallback) {
    showFeedback('Mode hors-ligne : mots issus du dictionnaire intégré.', 'already');
  }
}

// ============================================================
//  RENDER
// ============================================================
function renderWords() {
  const list = document.getElementById('wordList');
  list.innerHTML = '';

  PUZZLE.words.forEach((entry, i) => {
    const isAnchor = i === 0 || i === PUZZLE.words.length - 1;
    const isFound = state.found.has(entry.word);
    const hintShown = state.hintRevealed.has(entry.word);

    const div = document.createElement('div');
    div.className = 'word-entry' +
      (isAnchor ? ' anchor-word' : '') +
      (isFound ? ' found-word' : '');
    div.id = `entry-${entry.word}`;

    // Numéro
    const num = document.createElement('span');
    num.className = 'entry-num';
    num.textContent = String(i + 1).padStart(2, '0');
    div.appendChild(num);

    // Mot
    const wordCol = document.createElement('div');
    wordCol.className = 'word-col';
    if (isAnchor || isFound) {
      const wd = document.createElement('div');
      wd.className = 'word-display';
      wd.textContent = entry.word;
      wordCol.appendChild(wd);
    } else {
      const hidden = document.createElement('div');
      hidden.className = 'word-hidden';
      for (let c = 0; c < entry.word.length; c++) {
        const dash = document.createElement('div');
        dash.className = 'letter-dash';
        hidden.appendChild(dash);
      }
      wordCol.appendChild(hidden);
    }
    div.appendChild(wordCol);

    // Définition
    const defCol = document.createElement('div');
    defCol.className = 'definition-col';

    if (isAnchor || isFound || hintShown) {
      if (entry.grammar && entry.grammar !== '—') {
        const gramTag = document.createElement('div');
        gramTag.className = 'grammar-tag';
        gramTag.textContent = entry.grammar;
        defCol.appendChild(gramTag);
      }
      const defText = document.createElement('div');
      defText.className = 'definition-text';
      defText.textContent = entry.definition || '(définition non disponible)';
      defCol.appendChild(defText);
    } else {
      const defText = document.createElement('div');
      defText.className = 'definition-text hidden-def';
      // Nombre de tirets basé sur la définition si dispo, sinon aléatoire
      const wordCount = entry.definition
        ? entry.definition.split(' ').length
        : Math.floor(Math.random() * 6) + 4;
      for (let w = 0; w < Math.min(wordCount, 12); w++) {
        const dd = document.createElement('div');
        dd.className = 'def-dash';
        dd.style.width = (Math.random() * 20 + 18) + 'px';
        defText.appendChild(dd);
      }
      defCol.appendChild(defText);
    }
    div.appendChild(defCol);

    // Bouton hint — seulement si le mot a une définition
    const hintCol = document.createElement('div');
    hintCol.className = 'hint-col';
    if (!isAnchor && !isFound && entry.hasDefinition) {
      const btn = document.createElement('button');
      btn.className = 'hint-btn' + (hintShown ? ' used' : '');
      btn.title = 'Afficher la définition';
      btn.textContent = hintShown ? '✓' : '?';
      btn.onclick = () => revealHint(entry.word);
      hintCol.appendChild(btn);
    }
    div.appendChild(hintCol);

    list.appendChild(div);
  });
}

// ============================================================
//  HINT
// ============================================================
function revealHint(word) {
  if (state.hintRevealed.has(word)) return;
  state.hintRevealed.add(word);
  state.hintsUsed++;
  renderWords();
}

// ============================================================
//  INPUT
// ============================================================
function setupInput() {
  const input = document.getElementById('wordInput');
  const btn = document.getElementById('submitBtn');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  btn.onclick = submit;
}

// ============================================================
//  SUBMIT
// ============================================================
function submit() {
  const input = document.getElementById('wordInput');
  const raw = input.value.trim();
  if (!raw) return;

  const guess = raw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const guessWithAccents = raw.toUpperCase();

  state.guesses++;
  document.getElementById('guessCount').textContent = state.guesses;
  input.value = '';

  const firstWord = PUZZLE.words[0].word;
  const lastWord = PUZZLE.words[PUZZLE.words.length - 1].word;

  if (guessWithAccents === firstWord || guessWithAccents === lastWord ||
      guess === firstWord.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ||
      guess === lastWord.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) {
    showFeedback('Ce mot est déjà visible — c\'est un mot ancre !', 'already');
    return;
  }

  if (state.found.has(guessWithAccents)) {
    showFeedback(`« ${guessWithAccents} » est déjà trouvé !`, 'already');
    return;
  }

  const match = PUZZLE.words.find(w => {
    const wNorm = w.word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return w.word === guessWithAccents || wNorm === guess;
  });

  if (match) {
    state.found.add(match.word);
    showFeedback(`✓ Bravo ! « ${match.word} » — ${match.definition || ''}`, 'success');
    renderWords();
    flashEntry(match.word);
    updateProgress();
    if (state.found.size === state.total) {
      setTimeout(showCompletion, 800);
    }
  } else {
    showFeedback(`« ${guessWithAccents} » n'est pas dans cette page du dictionnaire.`, 'error');
    shakeInput();
  }
}

function showFeedback(text, type) {
  const msg = document.getElementById('feedbackMsg');
  msg.className = `feedback-msg ${type}`;
  msg.textContent = text;
  clearTimeout(msg._timer);
  msg._timer = setTimeout(() => { msg.textContent = ''; msg.className = 'feedback-msg'; }, 5000);
}

function flashEntry(word) {
  const el = document.getElementById(`entry-${word}`);
  if (!el) return;
  el.classList.add('just-found');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => el.classList.remove('just-found'), 600);
}

function shakeInput() {
  const input = document.getElementById('wordInput');
  input.style.outline = '2px solid var(--rust)';
  setTimeout(() => { input.style.outline = ''; }, 600);
}

// ============================================================
//  PROGRESS
// ============================================================
function updateProgress() {
  const found = state.found.size;
  const total = state.total;
  const pct = total > 0 ? (found / total) * 100 : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = `${found} / ${total} trouvés`;
}

// ============================================================
//  COMPLETION
// ============================================================
function showCompletion() {
  document.getElementById('finalGuesses').textContent = state.guesses;
  document.getElementById('finalHints').textContent = state.hintsUsed;
  document.getElementById('finalWords').textContent = state.found.size;
  document.getElementById('completionOverlay').classList.add('show');
  spawnConfetti();
  document.getElementById('shareBtn').onclick = shareScore;
}

function spawnConfetti() {
  const area = document.getElementById('confettiArea');
  area.innerHTML = '';
  const colors = ['#C9A84C','#B5451B','#2D6A4F','#1A1208','#8B7355','#E8C96A'];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.top = '-10px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    piece.style.width = (Math.random() * 8 + 4) + 'px';
    piece.style.height = (Math.random() * 8 + 4) + 'px';
    piece.style.animationDelay = Math.random() * 0.8 + 's';
    piece.style.animationDuration = (Math.random() * 0.8 + 0.8) + 's';
    area.appendChild(piece);
  }
}

function shareScore() {
  const date = PUZZLE.date;
  const score = `LexiPage — ${date}\n📖 ${state.found.size}/${state.total} mots\n🎯 ${state.guesses} essais\n💡 ${state.hintsUsed} indices\n\njouez sur lexipage.fr`;
  navigator.clipboard.writeText(score).then(() => {
    const btn = document.getElementById('shareBtn');
    btn.textContent = '✓ Copié !';
    setTimeout(() => { btn.textContent = '📋 Copier mon score'; }, 2000);
  }).catch(() => alert(score));
}

document.getElementById('completionOverlay').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('show');
});

// ============================================================
//  START
// ============================================================
generatePuzzle();
