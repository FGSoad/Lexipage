// ============================================================
//  LEXIPAGE — game.js
//  Mots : liste GitHub (kkrypt0nn/wordlists)
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
const WORDLIST_URL = 'https://raw.githubusercontent.com/kkrypt0nn/wordlists/main/wordlists/languages/french.txt';

async function loadWordList() {
  const resp = await fetchWithTimeout(WORDLIST_URL, 10000);
  const text = await resp.text();
  const words = text.split('\n')
    .map(w => w.trim().toUpperCase())
    .filter(w => /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇŒÆ]+$/.test(w)) // que des lettres françaises
    .filter(w => w.length >= 3)
    .filter((w, i, arr) => arr.indexOf(w) === i); // dédoublonnage
  console.log('Wordlist loaded:', words.length, 'mots');
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
    console.warn('generatePuzzle failed, using fallback:', e);
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

  if (allWords.length < 100) {
    useFallback();
    return;
  }

  const seed = dateSeed();
  const rng = seededRng(seed);

  // Trier alphabétiquement
  allWords.sort((a, b) => a.localeCompare(b, 'fr'));

  setLoadingMsg('Choix de la page du dictionnaire…');

  // Choisir un point de départ aléatoire reproductible
  const maxStart = allWords.length - 80;
  const startIdx = Math.floor(rng() * Math.max(1, maxStart));
  const slice = allWords.slice(startIdx, startIdx + 80);

  // 30 candidats espacés régulièrement dans le slice
  const step = Math.floor(slice.length / 30);
  let candidates = [];
  for (let i = 0; i < 30; i++) {
    const idx = i * step;
    if (idx < slice.length) candidates.push(slice[idx]);
  }
  candidates = [...new Set(candidates)];
  console.log('Candidates:', candidates);

  setLoadingMsg('Récupération des définitions…');

  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const w = candidates[i];
    setLoadingMsg(`Définitions… ${i + 1}/${candidates.length}`);
    const def = await fetchDefinition(w);
    console.log(w, '->', def ? 'ok' : 'null');
    if (def) {
      results.push({ word: w, grammar: def.grammar, definition: def.definition, letters: w.length });
    }
    if (i < candidates.length - 1) await sleep(100);
  }

  console.log('Results:', results.length, results.map(r => r.word));

  if (results.length < 4) {
    console.warn('Pas assez de définitions, fallback');
    useFallback();
    return;
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
    { word: "ABSINTHE", grammar: "n. f.", definition: "Plante aromatique amère ; liqueur alcoolisée d'une couleur verte caractéristique." },
    { word: "ACAJOU", grammar: "n. m.", definition: "Arbre tropical à bois rougeâtre précieux, utilisé en ébénisterie." },
    { word: "ACRIMONIE", grammar: "n. f.", definition: "Mauvaise humeur qui se manifeste par des paroles blessantes." },
    { word: "AFFABLE", grammar: "adj.", definition: "Qui accueille autrui avec bienveillance et douceur." },
    { word: "ALAMBIC", grammar: "n. m.", definition: "Appareil servant à distiller les liquides alcoolisés." },
    { word: "ALGÈBRE", grammar: "n. f.", definition: "Branche des mathématiques qui généralise l'arithmétique par l'usage de symboles." },
    { word: "ALTRUISTE", grammar: "adj.", definition: "Qui se soucie du bien d'autrui avant le sien propre." },
    { word: "AMULETTE", grammar: "n. f.", definition: "Petit objet que l'on porte sur soi comme protection contre le mauvais sort." },
    { word: "ANCOLIE", grammar: "n. f.", definition: "Plante ornementale aux fleurs en forme d'éperons, souvent bleues ou violettes." },
    { word: "ANTILOPE", grammar: "n. f.", definition: "Mammifère ruminant aux longues cornes, vivant principalement en Afrique." },
    { word: "APOGÉE", grammar: "n. m.", definition: "Point le plus élevé d'une trajectoire ; moment de plus grande gloire." },
    { word: "ARDOISE", grammar: "n. f.", definition: "Roche schisteuse gris-bleu utilisée pour couvrir les toits ou écrire." },
    { word: "BAROQUE", grammar: "adj.", definition: "D'une fantaisie ornementale exubérante ; qui surprend par son irrégularité." },
    { word: "BASALTE", grammar: "n. m.", definition: "Roche volcanique noire ou gris sombre, très dure et dense." },
    { word: "BÉATITUDE", grammar: "n. f.", definition: "Bonheur parfait et serein, état de félicité absolue." },
    { word: "BELVÉDÈRE", grammar: "n. m.", definition: "Construction ou terrasse offrant un beau point de vue sur le paysage." },
    { word: "BESTIAIRE", grammar: "n. m.", definition: "Recueil médiéval de descriptions allégoriques d'animaux réels ou fabuleux." },
    { word: "BIVOUAC", grammar: "n. m.", definition: "Campement provisoire en plein air, sans tentes, utilisé par des soldats ou randonneurs." },
    { word: "CHIMÈRE", grammar: "n. f.", definition: "Monstre fabuleux ; idée ou projet irréalisable, illusion vaine." },
    { word: "CITADELLE", grammar: "n. f.", definition: "Forteresse dominant une ville et servant à la défendre ou à la contrôler." },
    { word: "CLAVECIN", grammar: "n. m.", definition: "Instrument de musique à clavier dont les cordes sont pincées mécaniquement." },
    { word: "CRÉPUSCULE", grammar: "n. m.", definition: "Lumière diffuse qui précède le lever ou suit le coucher du soleil." },
    { word: "CRYPTE", grammar: "n. f.", definition: "Caveau souterrain aménagé sous une église pour servir de lieu de sépulture." },
    { word: "DAUPHIN", grammar: "n. m.", definition: "Mammifère marin cétacé très intelligent, réputé pour ses sauts acrobatiques." },
    { word: "DÉBÂCLE", grammar: "n. f.", definition: "Rupture soudaine des glaces sur un cours d'eau ; effondrement complet." },
    { word: "DÉDALE", grammar: "n. m.", definition: "Labyrinthe ; ensemble très compliqué et inextricable de rues ou de chemins." },
    { word: "DOLMEN", grammar: "n. m.", definition: "Monument mégalithique formé de grandes pierres plates posées sur des blocs dressés." },
    { word: "DRAKKAR", grammar: "n. m.", definition: "Navire viking à fond plat, propulsé à la voile et à la rame." },
    { word: "ÉCLIPSE", grammar: "n. f.", definition: "Disparition temporaire d'un astre occulté par un autre ; absence remarquée." },
    { word: "EMBARGO", grammar: "n. m.", definition: "Interdiction officielle de commercer avec un pays ou d'exporter certains biens." },
    { word: "ÉPOPÉE", grammar: "n. f.", definition: "Long poème héroïque narrant les exploits d'un héros ou d'un peuple." },
    { word: "ÉQUINOXE", grammar: "n. m.", definition: "Moment de l'année où le jour et la nuit ont la même durée." },
    { word: "ERMITE", grammar: "n. m.", definition: "Personne vivant seule et retirée du monde, généralement dans un but religieux." },
    { word: "FALAISE", grammar: "n. f.", definition: "Escarpement rocheux côtier, taillé à pic par l'érosion marine." },
    { word: "FESTIN", grammar: "n. m.", definition: "Repas somptueux et abondant, grand banquet." },
    { word: "FIASCO", grammar: "n. m.", definition: "Échec complet et retentissant, insuccès total." },
    { word: "FLAMBEAU", grammar: "n. m.", definition: "Torche ou grande bougie ; symbole de ce qui guide ou transmet." },
    { word: "GONDOLE", grammar: "n. f.", definition: "Embarcation vénitienne à fond plat, propulsée à la perche par un gondolier." },
    { word: "GORILLE", grammar: "n. m.", definition: "Grand primate d'Afrique équatoriale, le plus grand des singes." },
    { word: "GRIMOIRE", grammar: "n. m.", definition: "Livre de formules magiques ; écriture illisible et mystérieuse." },
    { word: "HARMONIE", grammar: "n. f.", definition: "Accord de sons agréables à l'oreille ; équilibre entre les parties d'un tout." },
    { word: "HORIZON", grammar: "n. m.", definition: "Ligne imaginaire où la terre semble rejoindre le ciel ; limite des perspectives." },
    { word: "LABYRINTHE", grammar: "n. m.", definition: "Réseau de chemins entremêlés dont il est difficile de trouver la sortie." },
    { word: "LAGUNE", grammar: "n. f.", definition: "Étendue d'eau de mer, peu profonde, séparée de la mer par un cordon littoral." },
    { word: "LUCIOLE", grammar: "n. f.", definition: "Insecte coléoptère qui produit une lumière verte par bioluminescence." },
    { word: "MÉANDRE", grammar: "n. m.", definition: "Courbe sinueuse d'un cours d'eau ; détour, sinuosité dans un raisonnement." },
    { word: "MENHIR", grammar: "n. m.", definition: "Grande pierre dressée verticalement, monument mégalithique préhistorique." },
    { word: "MIRAGE", grammar: "n. m.", definition: "Illusion d'optique en milieu chaud ; rêve ou espoir trompeur." },
    { word: "MISTRAL", grammar: "n. m.", definition: "Vent froid et violent soufflant du nord-ouest dans la vallée du Rhône." },
    { word: "NÉCROPOLE", grammar: "n. f.", definition: "Vaste lieu de sépulture, grand cimetière de l'Antiquité." },
    { word: "OBÉLISQUE", grammar: "n. m.", definition: "Colonne de pierre taillée en pyramide, monument de l'Égypte antique." },
    { word: "ODYSSÉE", grammar: "n. f.", definition: "Long voyage plein d'aventures et de péripéties ; récit de ces aventures." },
    { word: "ORACLE", grammar: "n. m.", definition: "Réponse d'un dieu à une consultation ; prophète qui la délivre." },
    { word: "OURAGAN", grammar: "n. m.", definition: "Tempête tropicale d'une violence extrême avec des vents dépassant 120 km/h." },
    { word: "PANACHE", grammar: "n. m.", definition: "Bouquet de plumes ornant un casque ; brio, fougue et élégance dans l'action." },
    { word: "PARADOXE", grammar: "n. m.", definition: "Proposition contraire à l'opinion commune mais qui peut être vraie." },
    { word: "PIROUETTE", grammar: "n. f.", definition: "Tour complet sur soi-même sur la pointe d'un pied ; évitement habile." },
    { word: "PLANÈTE", grammar: "n. f.", definition: "Corps céleste qui orbite autour d'une étoile sans produire sa propre lumière." },
    { word: "RÉCIF", grammar: "n. m.", definition: "Rocher ou chaîne de rochers à fleur d'eau, dangereux pour la navigation." },
    { word: "RÉSILIENCE", grammar: "n. f.", definition: "Capacité à se reconstruire après un traumatisme ou une épreuve difficile." },
    { word: "SAPHIR", grammar: "n. m.", definition: "Pierre précieuse bleue, variété de corindon, symbole de sagesse." },
    { word: "SÉQUOIA", grammar: "n. m.", definition: "Conifère géant de Californie, l'un des arbres les plus grands du monde." },
    { word: "SEXTANT", grammar: "n. m.", definition: "Instrument de navigation mesurant la hauteur des astres sur l'horizon." },
    { word: "STALACTITE", grammar: "n. f.", definition: "Concrétion calcaire pendant du plafond d'une grotte, formée par l'eau." },
    { word: "STALAGMITE", grammar: "n. f.", definition: "Concrétion calcaire montant du sol d'une grotte, formée par l'eau." },
    { word: "SYMBIOSE", grammar: "n. f.", definition: "Association durable et mutuellement bénéfique entre deux organismes vivants." },
    { word: "TARENTULE", grammar: "n. f.", definition: "Grande araignée du sud de l'Europe, dont la morsure est douloureuse." },
    { word: "TROGLODYTE", grammar: "n. m.", definition: "Habitant des cavernes préhistoriques ; oiseau très petit au chant puissant." },
    { word: "TURQUOISE", grammar: "n. f.", definition: "Pierre précieuse d'un bleu-vert caractéristique ; cette couleur." },
    { word: "VITRAIL", grammar: "n. m.", definition: "Panneau décoratif fait de morceaux de verre coloré assemblés avec du plomb." },
    { word: "VOLCAN", grammar: "n. m.", definition: "Relief terrestre résultant de l'émission de matériaux en fusion depuis le manteau." },
    { word: "ZÉNITH", grammar: "n. m.", definition: "Point du ciel situé directement au-dessus de l'observateur ; sommet, apogée." },
  ];

  POOL.sort((a, b) => a.word.localeCompare(b.word, 'fr'));
  const rng2 = seededRng(seed);
  rng2(); rng2();
  const maxIdx = POOL.length - 21;
  const startIdx = Math.floor(rng2() * maxIdx);
  const selected = POOL.slice(startIdx, startIdx + 20);

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

    const num = document.createElement('span');
    num.className = 'entry-num';
    num.textContent = String(i + 1).padStart(2, '0');
    div.appendChild(num);

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

    const defCol = document.createElement('div');
    defCol.className = 'definition-col';

    if (isAnchor || isFound || hintShown) {
      const gramTag = document.createElement('div');
      gramTag.className = 'grammar-tag';
      gramTag.textContent = entry.grammar;
      defCol.appendChild(gramTag);

      const defText = document.createElement('div');
      defText.className = 'definition-text';
      defText.textContent = entry.definition;
      defCol.appendChild(defText);
    } else {
      const defText = document.createElement('div');
      defText.className = 'definition-text hidden-def';
      const wordCount = entry.definition.split(' ').length;
      for (let w = 0; w < Math.min(wordCount, 12); w++) {
        const dd = document.createElement('div');
        dd.className = 'def-dash';
        dd.style.width = (Math.random() * 20 + 18) + 'px';
        defText.appendChild(dd);
      }
      defCol.appendChild(defText);
    }
    div.appendChild(defCol);

    const hintCol = document.createElement('div');
    hintCol.className = 'hint-col';

    if (!isAnchor && !isFound) {
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
    showFeedback(`✓ Bravo ! « ${match.word} » — ${match.definition}`, 'success');
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
