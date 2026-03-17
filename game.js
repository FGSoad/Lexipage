// ============================================================
//  WIKTIONARY — fetch words for a given letter prefix
//  Uses the FR Wiktionary API (allpages) — no CORS issues
// ============================================================

// DEBUG — forcer une date (format: YYYY-MM-DD)
// mets null pour revenir au comportement normal
const DEBUG_DATE = "2026-03-12";
// const DEBUG_DATE = null;

// Seeded RNG for reproducible daily puzzle
function seededRng(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

//function dateSeed() {
//  const today = new Date();
//  return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
//}

function dateSeed() {
  const today = DEBUG_DATE ? new Date(DEBUG_DATE) : new Date();
  return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

// Letters with decent Wiktionary coverage
const LETTERS = ['B','C','F','G','H','J','L','M','N','P','R','S','T','V'];

// Fetch with timeout — prevents hanging forever if API is unreachable
async function fetchWithTimeout(url, ms = 7000) {
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

async function fetchWiktionaryWords(prefix, limit = 80) {
  const url = `/api/wiktionary?action=list&prefix=${encodeURIComponent(prefix)}&limit=${limit}`;
  const resp = await fetchWithTimeout(url);
  const data = await resp.json();
  const pages = data.query.allpages.map(p => p.title.toUpperCase());
  // Keep only clean words: only letters + accents, 4–10 chars
  return pages.filter(w => /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ]{4,10}$/.test(w));
}

async function fetchDefinition(word) {
  const url = `/api/wiktionary?action=define&word=${encodeURIComponent(word.toLowerCase())}`;
  try {
    const resp = await fetchWithTimeout(url);
    const data = await resp.json();
    if (!data.result) return null;
    return data.result;
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
  setLoadingMsg('Choix de la page du dictionnaire…');

  const seed = dateSeed();
  const rng = seededRng(seed);

  // Pick letter
  const letterIdx = Math.floor(rng() * LETTERS.length);
  const letter = LETTERS[letterIdx];

  setLoadingMsg(`Chargement des mots en « ${letter} »…`);

  let words = [];
  try {
    words = await fetchWiktionaryWords(letter, 120);
  } catch(e) {
    // Fallback to hardcoded if API fails
    useFallback();
    return;
  }

  if (words.length < 20) {
    useFallback();
    return;
  }

  // Sort alphabetically
  words.sort((a, b) => a.localeCompare(b, 'fr'));

  // Pick a random starting position using seeded rng
  const maxStart = words.length - 22;
  const startIdx = Math.floor(rng() * Math.max(1, maxStart));
  const slice = words.slice(startIdx, startIdx + 60);

  // From this slice, pick 20 evenly spaced words
  const step = Math.floor(slice.length / 20);
  let candidates = [];
  for (let i = 0; i < 20 && candidates.length < 20; i++) {
    const idx = i * step;
    if (idx < slice.length) candidates.push(slice[idx]);
  }
  // Deduplicate
  candidates = [...new Set(candidates)].slice(0, 20);
  if (candidates.length < 6) { useFallback(); return; }

  setLoadingMsg('Récupération des définitions…');

  // Fetch definitions in parallel (limit to avoid rate limiting)
  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const w = candidates[i];
    setLoadingMsg(`Définitions… ${i + 1}/${candidates.length}`);
    const def = await fetchDefinition(w);
    if (def) {
      results.push({ word: w, grammar: def.grammar, definition: def.definition, letters: w.length });
    }
    // small delay to be polite to the API
    if (i < candidates.length - 1) await sleep(120);
  }

  if (results.length < 6) { useFallback(); return; }

  //const today = new Date().toISOString().split('T')[0];
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
//  FALLBACK — if API unreachable (CORS, offline, etc.)
// ============================================================
function useFallback() {
  const seed = dateSeed();
  const rng = seededRng(seed);

  // Large pool of French dictionary words with definitions
  const POOL = [
    { word: "ABSINTHE", grammar: "n. f.", definition: "Plante aromatique amère ; liqueur alcoolisée d'une couleur verte caractéristique." },
    { word: "ACAJOU", grammar: "n. m.", definition: "Arbre tropical à bois rougeâtre précieux, utilisé en ébénisterie." },
    { word: "ACRIMONIE", grammar: "n. f.", definition: "Mauvaise humeur qui se manifeste par des paroles blessantes." },
    { word: "AFFABLE", grammar: "adj.", definition: "Qui accueille autrui avec bienveillance et douceur." },
    { word: "AIGUADE", grammar: "n. f.", definition: "Provision d'eau douce faite par un navire lors d'une escale." },
    { word: "ALAMBIC", grammar: "n. m.", definition: "Appareil servant à distiller les liquides alcoolisés." },
    { word: "ALGÈBRE", grammar: "n. f.", definition: "Branche des mathématiques qui généralise l'arithmétique par l'usage de symboles." },
    { word: "ALTRUISTE", grammar: "adj.", definition: "Qui se soucie du bien d'autrui avant le sien propre." },
    { word: "AMULETTE", grammar: "n. f.", definition: "Petit objet que l'on porte sur soi comme protection contre le mauvais sort." },
    { word: "ANACHORÈTE", grammar: "n. m.", definition: "Moine qui vit seul, retiré du monde, dans la prière et la pénitence." },
    { word: "ANCOLIE", grammar: "n. f.", definition: "Plante ornementale aux fleurs en forme d'éperons, souvent bleues ou violettes." },
    { word: "ANNALES", grammar: "n. f. pl.", definition: "Recueil chronologique de faits historiques, enregistrés année par année." },
    { word: "ANTILOPE", grammar: "n. f.", definition: "Mammifère ruminant aux longues cornes, vivant principalement en Afrique." },
    { word: "APANAGE", grammar: "n. m.", definition: "Bien, avantage exclusivement réservé à quelqu'un ou à un groupe." },
    { word: "APOGÉE", grammar: "n. m.", definition: "Point le plus élevé d'une trajectoire ; moment de plus grande gloire." },
    { word: "ARBOUSE", grammar: "n. f.", definition: "Petit fruit rouge de l'arbousier, comestible, à saveur légèrement sucrée." },
    { word: "ARDOISE", grammar: "n. f.", definition: "Roche schisteuse gris-bleu utilisée pour couvrir les toits ou écrire." },
    { word: "ARÔME", grammar: "n. m.", definition: "Odeur agréable et caractéristique d'une plante, d'un aliment ou d'une boisson." },
    { word: "ASPHALTE", grammar: "n. m.", definition: "Mélange de bitume et de calcaire utilisé pour le revêtement des chaussées." },
    { word: "ATAVISME", grammar: "n. m.", definition: "Réapparition de caractères ancestraux après plusieurs générations." },
    { word: "AURORE", grammar: "n. f.", definition: "Lueur rose et dorée qui précède le lever du soleil ; début d'une ère nouvelle." },
    { word: "BAROQUE", grammar: "adj.", definition: "D'une fantaisie ornementale exubérante ; qui surprend par son irrégularité." },
    { word: "BASALTE", grammar: "n. m.", definition: "Roche volcanique noire ou gris sombre, très dure et dense." },
    { word: "BÉATITUDE", grammar: "n. f.", definition: "Bonheur parfait et serein, état de félicité absolue." },
    { word: "BÉGONIA", grammar: "n. m.", definition: "Plante ornementale aux fleurs colorées, cultivée dans les jardins et appartements." },
    { word: "BÉLIER", grammar: "n. m.", definition: "Mouton mâle non castré ; engin de guerre pour enfoncer les portes." },
    { word: "BELVÉDÈRE", grammar: "n. m.", definition: "Construction ou terrasse offrant un beau point de vue sur le paysage." },
    { word: "BÉNÉVOLE", grammar: "adj./n.", definition: "Qui accomplit un travail gratuitement, sans rémunération ni obligation." },
    { word: "BERBÈRE", grammar: "adj./n.", definition: "Relatif aux populations autochtones d'Afrique du Nord et à leurs langues." },
    { word: "BESTIAIRE", grammar: "n. m.", definition: "Recueil médiéval de descriptions allégoriques d'animaux réels ou fabuleux." },
    { word: "BIBELOT", grammar: "n. m.", definition: "Petit objet décoratif sans grande valeur mais souvent apprécié." },
    { word: "BIVOUAC", grammar: "n. m.", definition: "Campement provisoire en plein air, sans tentes, utilisé par des soldats ou randonneurs." },
    { word: "BOHÈME", grammar: "adj./n.", definition: "Qui mène une vie libre et désordonnée, au mépris des conventions sociales." },
    { word: "BOULEAU", grammar: "n. m.", definition: "Arbre à l'écorce blanche et lisse, aux feuilles finement dentées." },
    { word: "BROCANTE", grammar: "n. f.", definition: "Commerce d'objets anciens ou usagés ; lieu où se vendent ces objets." },
    { word: "CABANON", grammar: "n. m.", definition: "Petite cabane rustique, abri sommaire ; cellule d'isolement en psychiatrie." },
    { word: "CAILLOU", grammar: "n. m.", definition: "Pierre de petite taille, fragment rocheux arrondi par l'érosion." },
    { word: "CALÈCHE", grammar: "n. f.", definition: "Voiture à cheval découverte, à quatre roues, avec capote repliable." },
    { word: "CALLIGRAPHIE", grammar: "n. f.", definition: "Art de bien former les caractères d'écriture, traçés avec soin et esthétique." },
    { word: "CAMOMILLE", grammar: "n. f.", definition: "Plante herbacée aromatique dont les fleurs servent à préparer des infusions calmantes." },
    { word: "CAPRICE", grammar: "n. m.", definition: "Désir subit et passager, sans raison solide ; fantaisie imprévisible." },
    { word: "CARAVANE", grammar: "n. f.", definition: "Convoi de voyageurs ou de marchands traversant des régions désertiques." },
    { word: "CARNAVAL", grammar: "n. m.", definition: "Période de fêtes et de déguisements précédant le carême." },
    { word: "CAVERNE", grammar: "n. f.", definition: "Grotte naturelle creusée dans une roche, souvent vaste et profonde." },
    { word: "CHAGRIN", grammar: "n. m.", definition: "Douleur morale, tristesse profonde causée par un événement pénible." },
    { word: "CHANDELLE", grammar: "n. f.", definition: "Bougie grossière faite de suif ; acrobatie verticale en avion ou football." },
    { word: "CHAOS", grammar: "n. m.", definition: "Désordre complet, confusion inextricable ; état antérieur à la création du monde." },
    { word: "CHAROGNE", grammar: "n. f.", definition: "Corps en décomposition d'un animal mort ; terme d'injure grossier." },
    { word: "CHIMÈRE", grammar: "n. f.", definition: "Monstre fabuleux ; idée ou projet irréalisable, illusion vaine." },
    { word: "CHRONIQUE", grammar: "adj./n.", definition: "Qui dure longtemps et revient régulièrement ; article régulier dans un journal." },
    { word: "CIDRE", grammar: "n. m.", definition: "Boisson fermentée fabriquée à partir du jus de pomme." },
    { word: "CINÉASTE", grammar: "n.", definition: "Auteur ou réalisateur de films cinématographiques." },
    { word: "CITADELLE", grammar: "n. f.", definition: "Forteresse dominant une ville et servant à la défendre ou à la contrôler." },
    { word: "CLAIRON", grammar: "n. m.", definition: "Instrument à vent en cuivre sans pistons ; son clair et puissant." },
    { word: "CLAVECIN", grammar: "n. m.", definition: "Instrument de musique à clavier dont les cordes sont pincées mécaniquement." },
    { word: "CLOÎTRE", grammar: "n. m.", definition: "Galerie couverte à colonnes entourant une cour intérieure de monastère." },
    { word: "COBALT", grammar: "n. m.", definition: "Métal dur de couleur grise ; pigment bleu intense utilisé en peinture." },
    { word: "COHORTE", grammar: "n. f.", definition: "Division d'une légion romaine ; groupe nombreux de personnes." },
    { word: "COLOPHANE", grammar: "n. f.", definition: "Résine solide extraite de la térébenthine, utilisée pour frotter les archets." },
    { word: "COMATEUX", grammar: "adj.", definition: "Relatif au coma ; qui est dans un état d'inconscience profonde." },
    { word: "CORBEILLE", grammar: "n. f.", definition: "Panier à rebord bas et évasé ; parterre de fleurs en forme de coupe." },
    { word: "CORBEAU", grammar: "n. m.", definition: "Grand oiseau au plumage noir brillant, réputé pour son intelligence." },
    { word: "CORNICHE", grammar: "n. f.", definition: "Saillie horizontale en haut d'un édifice ; route étroite en flanc de montagne." },
    { word: "COROLLE", grammar: "n. f.", definition: "Ensemble des pétales d'une fleur, formant une enveloppe colorée." },
    { word: "COULIS", grammar: "n. m.", definition: "Sauce lisse obtenue en passant des légumes ou fruits cuits au tamis." },
    { word: "COUPOLE", grammar: "n. f.", definition: "Voûte hémisphérique couronnant un édifice, dôme arrondi." },
    { word: "CRÉPUSCULE", grammar: "n. m.", definition: "Lumière diffuse qui précède le lever ou suit le coucher du soleil." },
    { word: "CRIQUET", grammar: "n. m.", definition: "Insecte sauteur proche de la sauterelle, qui stridule en frottant ses pattes." },
    { word: "CROCHET", grammar: "n. m.", definition: "Pièce recourbée servant à accrocher ; aiguille pour tricoter ou faire de la dentelle." },
    { word: "CRYPTE", grammar: "n. f.", definition: "Caveau souterrain aménagé sous une église pour servir de lieu de sépulture." },
    { word: "CYCLONE", grammar: "n. m.", definition: "Perturbation atmosphérique violente avec des vents tourbillonnants." },
    { word: "DAUPHIN", grammar: "n. m.", definition: "Mammifère marin cétacé très intelligent, réputé pour ses sauts acrobatiques." },
    { word: "DÉBÂCLE", grammar: "n. f.", definition: "Rupture soudaine des glaces sur un cours d'eau ; effondrement complet." },
    { word: "DÉDALE", grammar: "n. m.", definition: "Labyrinthe ; ensemble très compliqué et inextricable de rues ou de chemins." },
    { word: "DÉLUGE", grammar: "n. m.", definition: "Pluie torrentielle et abondante ; grande inondation biblique." },
    { word: "DÉMIURGE", grammar: "n. m.", definition: "Dans les doctrines gnostiques, créateur du monde matériel ; artisan du cosmos." },
    { word: "DÉPÔT", grammar: "n. m.", definition: "Action de confier quelque chose à la garde de quelqu'un ; lieu de stockage." },
    { word: "DÉSERT", grammar: "n. m.", definition: "Région aride sans végétation ni population ; zone désolée et vide." },
    { word: "DIAPASON", grammar: "n. m.", definition: "Instrument donnant un la de référence ; étendue de la voix ou d'un instrument." },
    { word: "DIORAMA", grammar: "n. m.", definition: "Représentation en trois dimensions d'une scène avec décors peints en arrière-plan." },
    { word: "DOLMEN", grammar: "n. m.", definition: "Monument mégalithique formé de grandes pierres plates posées sur des blocs dressés." },
    { word: "DOMAINE", grammar: "n. m.", definition: "Propriété foncière étendue ; sphère d'activité ou de compétence." },
    { word: "DOUANE", grammar: "n. f.", definition: "Administration chargée de contrôler les marchandises aux frontières." },
    { word: "DRAKKAR", grammar: "n. m.", definition: "Navire viking à fond plat, propulsé à la voile et à la rame." },
    { word: "ÉCLIPSE", grammar: "n. f.", definition: "Disparition temporaire d'un astre occulté par un autre ; absence remarquée." },
    { word: "ÉCORCE", grammar: "n. f.", definition: "Enveloppe externe du tronc et des branches d'un arbre." },
    { word: "EFFIGIE", grammar: "n. f.", definition: "Représentation sculptée ou peinte du visage ou de la personne de quelqu'un." },
    { word: "EMBARGO", grammar: "n. m.", definition: "Interdiction officielle de commercer avec un pays ou d'exporter certains biens." },
    { word: "EMPHASE", grammar: "n. f.", definition: "Exagération pompeuse dans le ton, les gestes ou l'expression." },
    { word: "ENCLAVE", grammar: "n. f.", definition: "Territoire entouré par un autre et sans accès à la mer ; zone isolée." },
    { word: "ENDIVE", grammar: "n. f.", definition: "Pousse blanche et tendre de chicorée, cultivée à l'obscurité pour rester pale." },
    { word: "ÉPIGRAPHE", grammar: "n. f.", definition: "Inscription gravée sur un monument ; citation en tête d'un livre ou chapitre." },
    { word: "ÉPILOGUE", grammar: "n. m.", definition: "Conclusion d'un ouvrage littéraire ; dénouement d'une affaire." },
    { word: "ÉPOPÉE", grammar: "n. f.", definition: "Long poème héroïque narrant les exploits d'un héros ou d'un peuple." },
    { word: "ÉQUINOXE", grammar: "n. m.", definition: "Moment de l'année où le jour et la nuit ont la même durée." },
    { word: "ERGOT", grammar: "n. m.", definition: "Petite excroissance cornée derrière la patte du coq ; champignon parasite du seigle." },
    { word: "ERMITE", grammar: "n. m.", definition: "Personne vivant seule et retirée du monde, généralement dans un but religieux." },
    { word: "ESTRADE", grammar: "n. f.", definition: "Plancher surélevé sur lequel on installe une chaise, un bureau ou une scène." },
    { word: "ÉTABLE", grammar: "n. f.", definition: "Bâtiment rural destiné à loger les bovins et autres animaux domestiques." },
    { word: "ÉTALON", grammar: "n. m.", definition: "Cheval mâle non castré utilisé pour la reproduction ; mesure de référence." },
    { word: "ÉTRAVE", grammar: "n. f.", definition: "Pièce de la proue d'un navire qui forme l'avant de la quille." },
    { word: "FAGOT", grammar: "n. m.", definition: "Assemblage de menues branches liées ensemble, utilisé comme combustible." },
    { word: "FALAISE", grammar: "n. f.", definition: "Escarpement rocheux côtier, taillé à pic par l'érosion marine." },
    { word: "FANFARE", grammar: "n. f.", definition: "Orchestre composé principalement d'instruments de cuivre et de percussions." },
    { word: "FARCEUR", grammar: "n. m.", definition: "Personne qui aime faire des farces et des plaisanteries." },
    { word: "FATIGUE", grammar: "n. f.", definition: "Sensation de lassitude due à un effort physique ou mental prolongé." },
    { word: "FAVORI", grammar: "adj./n.", definition: "Que l'on préfère entre tous ; concurrent donné gagnant d'avance." },
    { word: "FÉBRILE", grammar: "adj.", definition: "Qui dénote une grande agitation ou une nervosité intense ; relatif à la fièvre." },
    { word: "FÉLONIE", grammar: "n. f.", definition: "Trahison d'un vassal envers son seigneur ; déloyauté grave." },
    { word: "FENOUIL", grammar: "n. m.", definition: "Plante aromatique aux feuilles découpées et à l'odeur anisée." },
    { word: "FERVENT", grammar: "adj.", definition: "Qui manifeste une ardeur, un enthousiasme vif et sincère." },
    { word: "FESTIN", grammar: "n. m.", definition: "Repas somptueux et abondant, grand banquet." },
    { word: "FÉTICHE", grammar: "n. m.", definition: "Objet auquel on attribue un pouvoir magique ou protecteur." },
    { word: "FEUILLET", grammar: "n. m.", definition: "Petite feuille, page d'un livre ou d'un cahier ; membrane mince." },
    { word: "FIASCO", grammar: "n. m.", definition: "Échec complet et retentissant, insuccès total." },
    { word: "FICELLE", grammar: "n. f.", definition: "Fil résistant servant à attacher ; stratagème habile pour atteindre un but." },
    { word: "FIDÈLE", grammar: "adj.", definition: "Qui reste constant dans ses affections, ses engagements et ses convictions." },
    { word: "FILAMENT", grammar: "n. m.", definition: "Fibre très fine et allongée ; fil conducteur dans une ampoule électrique." },
    { word: "FINESSE", grammar: "n. f.", definition: "Caractère subtil et délicat ; habileté à saisir les nuances." },
    { word: "FISSURE", grammar: "n. f.", definition: "Petite fente dans un mur, une roche ou un matériau solide." },
    { word: "FLAMBEAU", grammar: "n. m.", definition: "Torche ou grande bougie ; symbole de ce qui guide ou transmet." },
    { word: "GABION", grammar: "n. m.", definition: "Panier cylindrique rempli de terre ou pierres, utilisé pour des fortifications." },
    { word: "GAIETÉ", grammar: "n. f.", definition: "Humeur joyeuse, disposition à la joie et à la bonne humeur." },
    { word: "GALERIE", grammar: "n. f.", definition: "Couloir long et couvert ; salle d'exposition pour les œuvres d'art." },
    { word: "GALION", grammar: "n. m.", definition: "Grand navire à voiles des XVIe et XVIIe siècles, utilisé par les Espagnols." },
    { word: "GARGOUILLE", grammar: "n. f.", definition: "Gouttière sculptée en forme de monstre, sur les cathédrales gothiques." },
    { word: "GARNISON", grammar: "n. f.", definition: "Corps de troupes établi dans une place forte pour la défendre." },
    { word: "GAUFRE", grammar: "n. f.", definition: "Pâtisserie légère cuite dans un moule alvéolé chauffé." },
    { word: "GÉRANIUM", grammar: "n. m.", definition: "Plante ornementale aux fleurs vives et colorées, souvent cultivée en pot." },
    { word: "GIROFLE", grammar: "n. m.", definition: "Bouton floral séché du giroflier, utilisé comme épice très aromatique." },
    { word: "GLAISEUX", grammar: "adj.", definition: "Qui contient de la glaise, qui est de nature argileuse et collante." },
    { word: "GOBELET", grammar: "n. m.", definition: "Petit récipient sans anse ni pied pour boire." },
    { word: "GONDOLE", grammar: "n. f.", definition: "Embarcation vénitienne à fond plat, propulsée à la perche par un gondolier." },
    { word: "GORILLE", grammar: "n. m.", definition: "Grand primate d'Afrique équatoriale, le plus grand des singes." },
    { word: "GOUFFRE", grammar: "n. m.", definition: "Abîme très profond ; perte d'argent considérable." },
    { word: "GRAVURE", grammar: "n. f.", definition: "Technique de reproduction par incision sur métal ou bois ; image ainsi obtenue." },
    { word: "GRIMOIRE", grammar: "n. m.", definition: "Livre de formules magiques ; écriture illisible et mystérieuse." },
    { word: "GROTTE", grammar: "n. f.", definition: "Cavité naturelle dans un rocher ou sous la terre." },
    { word: "GUIRLANDE", grammar: "n. f.", definition: "Ornement de feuillage, fleurs ou lumières disposés en chaîne." },
    { word: "HAMEAU", grammar: "n. m.", definition: "Petit groupe de maisons à l'écart d'un village, sans église ni mairie." },
    { word: "HARFANG", grammar: "n. m.", definition: "Grande chouette blanche des régions arctiques, au plumage immaculé." },
    { word: "HARMONIE", grammar: "n. f.", definition: "Accord de sons agréables à l'oreille ; équilibre entre les parties d'un tout." },
    { word: "HÉRISSON", grammar: "n. m.", definition: "Petit mammifère insectivore couvert de piquants sur le dos." },
    { word: "HORIZON", grammar: "n. m.", definition: "Ligne imaginaire où la terre semble rejoindre le ciel ; limite des perspectives." },
    { word: "HORLOGE", grammar: "n. f.", definition: "Appareil mécanique ou électronique indiquant l'heure avec précision." },
    { word: "HYMNE", grammar: "n. m.", definition: "Chant solennel à la gloire d'une divinité, d'une nation ou d'un héros." },
    { word: "IBÉRIQUE", grammar: "adj.", definition: "Relatif à la péninsule ibérique, à l'Espagne et au Portugal." },
    { word: "ICÔNE", grammar: "n. f.", definition: "Image sainte dans l'Église orthodoxe ; symbole graphique sur un écran." },
    { word: "IDYLLE", grammar: "n. f.", definition: "Poème pastoral évoquant une vie champêtre ; amour tendre et naïf." },
    { word: "IVOIRE", grammar: "n. m.", definition: "Substance dure et blanche constituant les défenses d'éléphant." },
    { word: "JADE", grammar: "n. m.", definition: "Pierre précieuse d'un vert intense, utilisée depuis l'Antiquité en Chine." },
    { word: "JALOUSIE", grammar: "n. f.", definition: "Sentiment pénible causé par la peur de perdre ce qu'on possède ; store à lamelles." },
    { word: "JASMIN", grammar: "n. m.", definition: "Arbuste grimpant aux fleurs blanches ou jaunes très parfumées." },
    { word: "JONQUE", grammar: "n. f.", definition: "Navire à voiles carrées utilisé en Extrême-Orient depuis des siècles." },
    { word: "JUNGLE", grammar: "n. f.", definition: "Forêt tropicale dense et impénétrable ; milieu hostile et compétitif." },
    { word: "KARMA", grammar: "n. m.", definition: "Dans l'hindouisme, somme des actes passés influençant la destinée future." },
    { word: "KERMESSE", grammar: "n. f.", definition: "Fête populaire en plein air avec stands et attractions." },
    { word: "LABYRINTHE", grammar: "n. m.", definition: "Réseau de chemins entremêlés dont il est difficile de trouver la sortie." },
    { word: "LAGUNE", grammar: "n. f.", definition: "Étendue d'eau de mer, peu profonde, séparée de la mer par un cordon littoral." },
    { word: "LAMPROIE", grammar: "n. f.", definition: "Animal aquatique primitif en forme d'anguille, sans mâchoire articulée." },
    { word: "LANTERNE", grammar: "n. f.", definition: "Récipient transparent protégeant une flamme ; tourelle vitrée sur un dôme." },
    { word: "LARMOYER", grammar: "v.", definition: "Pleurer facilement, se lamenter avec affectation." },
    { word: "LAURIER", grammar: "n. m.", definition: "Arbre méditerranéen aux feuilles persistantes aromatiques, symbole de gloire." },
    { word: "LÉZARD", grammar: "n. m.", definition: "Petit reptile squamate aux écailles brillantes, très agile au soleil." },
    { word: "LIERRE", grammar: "n. m.", definition: "Plante grimpante à feuilles persistantes qui s'accroche aux murs et aux arbres." },
    { word: "LIMACE", grammar: "n. f.", definition: "Mollusque terrestre sans coquille, se déplaçant lentement sur un mucus." },
    { word: "LISERON", grammar: "n. m.", definition: "Plante grimpante aux fleurs en entonnoir blanc ou rose, souvent envahissante." },
    { word: "LOUTRE", grammar: "n. f.", definition: "Mammifère semi-aquatique au pelage brun, excellent nageur." },
    { word: "LUCIOLE", grammar: "n. f.", definition: "Insecte coléoptère qui produit une lumière verte par bioluminescence." },
    { word: "MADRIER", grammar: "n. m.", definition: "Planche de bois épaisse et solide utilisée dans la construction." },
    { word: "MANCHOT", grammar: "n. m.", definition: "Oiseau marin de l'hémisphère sud aux ailes réduites à des nageoires." },
    { word: "MANGROVE", grammar: "n. f.", definition: "Formation végétale littorale tropicale, avec des racines aériennes dans la vase." },
    { word: "MANTEAU", grammar: "n. m.", definition: "Vêtement ample à manches longues ; couche géologique entre croûte et noyau." },
    { word: "MARÉCAGE", grammar: "n. m.", definition: "Terrain bas et humide, couvert d'eaux stagnantes et de végétation aquatique." },
    { word: "MARGELLE", grammar: "n. f.", definition: "Rebord de pierre entourant l'ouverture d'un puits." },
    { word: "MÉANDRE", grammar: "n. m.", definition: "Courbe sinueuse d'un cours d'eau ; détour, sinuosité dans un raisonnement." },
    { word: "MENHIR", grammar: "n. m.", definition: "Grande pierre dressée verticalement, monument mégalithique préhistorique." },
    { word: "MÉNESTREL", grammar: "n. m.", definition: "Au Moyen Âge, musicien ou jongleur qui chantait et récitait des vers." },
    { word: "MERCURE", grammar: "n. m.", definition: "Métal liquide à température ambiante, d'un blanc argenté très brillant." },
    { word: "MICOCOULIER", grammar: "n. m.", definition: "Arbre méditerranéen au bois très dur, dont les fruits sont comestibles." },
    { word: "MIEL", grammar: "n. m.", definition: "Substance sucrée élaborée par les abeilles à partir du nectar des fleurs." },
    { word: "MIRAGE", grammar: "n. m.", definition: "Illusion d'optique en milieu chaud ; rêve ou espoir trompeur." },
    { word: "MISTRAL", grammar: "n. m.", definition: "Vent froid et violent soufflant du nord-ouest dans la vallée du Rhône." },
    { word: "MONARQUE", grammar: "n. m.", definition: "Souverain qui gouverne seul un État ; grand papillon migrateur d'Amérique." },
    { word: "MONOLITHE", grammar: "n. m.", definition: "Monument formé d'un seul bloc de pierre ; structure uniforme et massive." },
    { word: "MONSTRE", grammar: "n. m.", definition: "Être imaginaire effrayant ; personne d'une méchanceté ou laideur extrême." },
    { word: "MOUSSON", grammar: "n. f.", definition: "Vent saisonnier des régions tropicales apportant de fortes pluies." },
    { word: "MURÈNE", grammar: "n. f.", definition: "Grand poisson de mer serpentiforme très vorace, à la morsure dangereuse." },
    { word: "NACRE", grammar: "n. f.", definition: "Substance irisée formant l'intérieur de certains coquillages." },
    { word: "NAUTILE", grammar: "n. m.", definition: "Mollusque céphalopode à coquille spirale cloisonnée, fossile vivant." },
    { word: "NÉCROPOLE", grammar: "n. f.", definition: "Vaste lieu de sépulture, grand cimetière de l'Antiquité." },
    { word: "NÉNUPHAR", grammar: "n. m.", definition: "Plante aquatique aux larges feuilles flottantes et aux fleurs blanches ou jaunes." },
    { word: "NOMADE", grammar: "adj./n.", definition: "Qui n'a pas de demeure fixe et se déplace selon les saisons ou les ressources." },
    { word: "NONCHALANCE", grammar: "n. f.", definition: "Manque d'ardeur et d'entrain ; attitude insouciante et désinvolte." },
    { word: "NOVICE", grammar: "n./adj.", definition: "Débutant sans expérience dans un domaine ; religieux en période d'essai." },
    { word: "NUANCE", grammar: "n. f.", definition: "Degré subtil dans la qualité d'une couleur, d'un son ou d'une idée." },
    { word: "OBÉLISQUE", grammar: "n. m.", definition: "Colonne de pierre taillée en pyramide, monument de l'Égypte antique." },
    { word: "OCARINA", grammar: "n. m.", definition: "Petit instrument à vent en terre cuite ou céramique, en forme d'œuf." },
    { word: "OCRE", grammar: "n. m./adj.", definition: "Pigment naturel jaune-brun ; de la couleur jaunâtre de cette terre." },
    { word: "ODYSSÉE", grammar: "n. f.", definition: "Long voyage plein d'aventures et de péripéties ; récit de ces aventures." },
    { word: "OLÉANDRE", grammar: "n. m.", definition: "Arbuste méditerranéen aux fleurs roses ou blanches, très toxique." },
    { word: "ORACLE", grammar: "n. m.", definition: "Réponse d'un dieu à une consultation ; prophète qui la délivre." },
    { word: "ORAGE", grammar: "n. m.", definition: "Perturbation atmosphérique violente avec tonnerre, éclairs et forte pluie." },
    { word: "ORGUE", grammar: "n. m.", definition: "Grand instrument à vent à tuyaux, actionné par un clavier dans les cathédrales." },
    { word: "ORIGAN", grammar: "n. m.", definition: "Plante aromatique méditerranéenne utilisée en cuisine, proche du thym." },
    { word: "ORNIÈRE", grammar: "n. f.", definition: "Sillon creusé dans un chemin par le passage répété des roues." },
    { word: "OSTRÉICULTURE", grammar: "n. f.", definition: "Élevage et exploitation commerciale des huîtres en parcs." },
    { word: "OURAGAN", grammar: "n. m.", definition: "Tempête tropicale d'une violence extrême avec des vents dépassant 120 km/h." },
    { word: "PACHYDERME", grammar: "n. m.", definition: "Mammifère à peau épaisse comme l'éléphant, le rhinocéros ou l'hippopotame." },
    { word: "PAGODE", grammar: "n. f.", definition: "Tour à étages multiples, temple bouddhiste en Asie orientale." },
    { word: "PALOMBE", grammar: "n. f.", definition: "Pigeon ramier sauvage, migrateur, très chassé dans le Sud-Ouest de la France." },
    { word: "PANACHE", grammar: "n. m.", definition: "Bouquet de plumes ornant un casque ; brio, fougue et élégance dans l'action." },
    { word: "PANTHÈRE", grammar: "n. f.", definition: "Grand félin au pelage tacheté ou entièrement noir, très agile." },
    { word: "PARADOXE", grammar: "n. m.", definition: "Proposition contraire à l'opinion commune mais qui peut être vraie." },
    { word: "PARCHEMIN", grammar: "n. m.", definition: "Peau d'animal préparée pour écrire ; document ancien sur ce support." },
    { word: "PASTÈQUE", grammar: "n. f.", definition: "Grand fruit à chair rouge et juteuse, d'origine africaine, très rafraîchissant." },
    { word: "PATCHWORK", grammar: "n. m.", definition: "Technique textile assemblant des morceaux de tissu multicolores." },
    { word: "PÉRIMÈTRE", grammar: "n. m.", definition: "Ligne qui délimite une figure géométrique ; distance qui en fait le tour." },
    { word: "PÉTRICHOR", grammar: "n. m.", definition: "Odeur agréable que dégage la terre sèche lors des premières pluies." },
    { word: "PHALANGE", grammar: "n. f.", definition: "Formation militaire grecque ; os des doigts et des orteils." },
    { word: "PHÉNOMÈNE", grammar: "n. m.", definition: "Ce qui apparaît à la conscience ou aux sens ; fait remarquable." },
    { word: "PIEUVRE", grammar: "n. f.", definition: "Grand céphalopode aux huit tentacules munis de ventouses." },
    { word: "PINGOUIN", grammar: "n. m.", definition: "Oiseau marin de l'hémisphère nord, excellent nageur." },
    { word: "PIRANHA", grammar: "n. m.", definition: "Poisson carnivore d'Amérique du Sud, aux dents tranchantes redoutables." },
    { word: "PIROUETTE", grammar: "n. f.", definition: "Tour complet sur soi-même sur la pointe d'un pied ; évitement habile." },
    { word: "PISTIL", grammar: "n. m.", definition: "Organe femelle d'une fleur, comprenant l'ovaire, le style et le stigmate." },
    { word: "PLANÈTE", grammar: "n. f.", definition: "Corps céleste qui orbite autour d'une étoile sans produire sa propre lumière." },
    { word: "PLATANE", grammar: "n. m.", definition: "Grand arbre à l'écorce qui se détache en plaques, fréquent dans les allées." },
    { word: "PLÉIADE", grammar: "n. f.", definition: "Groupe de sept étoiles dans la constellation du Taureau ; groupe d'artistes illustres." },
    { word: "PLUMAGE", grammar: "n. m.", definition: "Ensemble des plumes qui couvrent le corps d'un oiseau." },
    { word: "POLYPE", grammar: "n. m.", definition: "Animal marin fixé comme la méduse ou le corail ; excroissance sur une muqueuse." },
    { word: "PRAIRIE", grammar: "n. f.", definition: "Étendue de terrain couverte d'herbes, naturellement ou par culture." },
    { word: "PRISME", grammar: "n. m.", definition: "Solide à bases parallèles polygonales ; outil décomposant la lumière blanche." },
    { word: "PROMESSE", grammar: "n. f.", definition: "Engagement de faire ou ne pas faire quelque chose ; espoir fondé." },
    { word: "PROPHÈTE", grammar: "n. m.", definition: "Personne inspirée qui annonce l'avenir ou interprète la volonté divine." },
    { word: "PROVENDE", grammar: "n. f.", definition: "Provisions de bouche ; nourriture d'animaux, fourrage et grains mélangés." },
    { word: "PRUNELLE", grammar: "n. f.", definition: "Pupille de l'œil ; petite prune sauvage bleu-noir aux saveurs astringentes." },
    { word: "PUCE", grammar: "n. f.", definition: "Insecte parasite sauteur ; composant électronique miniaturisé." },
    { word: "PYTHON", grammar: "n. m.", definition: "Grand serpent non venimeux qui tue ses proies par constriction." },
    { word: "QUADRIGE", grammar: "n. m.", definition: "Char antique tiré par quatre chevaux de front." },
    { word: "QUARTZ", grammar: "n. m.", definition: "Minéral très répandu, à cristaux hexagonaux transparents ou colorés." },
    { word: "RAMURE", grammar: "n. f.", definition: "Ensemble des branches et ramifications d'un arbre ; bois d'un cerf." },
    { word: "RAPACE", grammar: "n. m./adj.", definition: "Oiseau de proie comme l'aigle ou le faucon ; avide, qui cherche à s'enrichir." },
    { word: "RAVINE", grammar: "n. f.", definition: "Petit ravin creusé par les eaux de ruissellement dans un terrain meuble." },
    { word: "RÉCIF", grammar: "n. m.", definition: "Rocher ou chaîne de rochers à fleur d'eau, dangereux pour la navigation." },
    { word: "RÉSINE", grammar: "n. f.", definition: "Substance visqueuse et collante sécrétée par certains arbres comme les pins." },
    { word: "RÊVERIE", grammar: "n. f.", definition: "État d'esprit de celui qui laisse vagabonder ses pensées librement." },
    { word: "RHIZOME", grammar: "n. m.", definition: "Tige souterraine horizontale de certaines plantes, qui émet racines et pousses." },
    { word: "RIVIÈRE", grammar: "n. f.", definition: "Cours d'eau naturel se jetant dans un autre cours d'eau ou dans la mer." },
    { word: "RONDELLE", grammar: "n. f.", definition: "Petite pièce plate en forme de disque percée d'un trou central." },
    { word: "ROSEAU", grammar: "n. m.", definition: "Plante aquatique à tiges creuses qui pousse en bordure des eaux." },
    { word: "RUBIS", grammar: "n. m.", definition: "Pierre précieuse rouge de grande valeur, variété de corindon." },
    { word: "RUSTIQUE", grammar: "adj.", definition: "Qui appartient à la campagne, à la vie paysanne ; robuste et simple." },
    { word: "SABLIER", grammar: "n. m.", definition: "Instrument mesurant le temps par l'écoulement de sable entre deux ampoules." },
    { word: "SAFRAN", grammar: "n. m.", definition: "Épice jaune orangée extraite des pistils d'un crocus, très précieuse." },
    { word: "SAPHIR", grammar: "n. m.", definition: "Pierre précieuse bleue, variété de corindon, symbole de sagesse." },
    { word: "SARMENT", grammar: "n. m.", definition: "Rameau de vigne qui a porté des raisins, utilisé comme combustible." },
    { word: "SAVANE", grammar: "n. f.", definition: "Formation végétale tropicale de grandes herbes parsemées d'arbres isolés." },
    { word: "SCARABÉE", grammar: "n. m.", definition: "Coléoptère sacré dans l'Égypte antique ; insecte aux élytres durs." },
    { word: "SÉQUOIA", grammar: "n. m.", definition: "Conifère géant de Californie, l'un des arbres les plus grands du monde." },
    { word: "SÉRAPHIN", grammar: "n. m.", definition: "Ange de la première hiérarchie dans la tradition judéo-chrétienne." },
    { word: "SEXTANT", grammar: "n. m.", definition: "Instrument de navigation mesurant la hauteur des astres sur l'horizon." },
    { word: "SILEX", grammar: "n. m.", definition: "Roche siliceuse très dure utilisée par la préhistoire pour tailler des outils." },
    { word: "SIMOUN", grammar: "n. m.", definition: "Vent chaud et violent, chargé de sable, soufflant dans les déserts." },
    { word: "SIPHON", grammar: "n. m.", definition: "Tuyau courbe permettant de faire passer un liquide par-dessus un obstacle." },
    { word: "SONNET", grammar: "n. m.", definition: "Poème de quatorze vers répartis en deux quatrains et deux tercets." },
    { word: "SOUPIRAIL", grammar: "n. m.", definition: "Petite ouverture au bas d'un mur donnant de l'air à une cave." },
    { word: "SQUELETTE", grammar: "n. m.", definition: "Ensemble des os d'un vertébré ; structure portante d'un ouvrage." },
    { word: "STALACTITE", grammar: "n. f.", definition: "Concrétion calcaire pendant du plafond d'une grotte, formée par l'eau." },
    { word: "STALAGMITE", grammar: "n. f.", definition: "Concrétion calcaire montant du sol d'une grotte, formée par l'eau." },
    { word: "STEPPE", grammar: "n. f.", definition: "Vaste plaine herbeuse semi-aride des régions tempérées continentales." },
    { word: "STIGMATE", grammar: "n. m.", definition: "Marque durable laissée par une blessure ; signe distinctif d'une origine." },
    { word: "STRATÈGE", grammar: "n. m.", definition: "Général ou chef militaire habile ; personne qui élabore des plans d'action." },
    { word: "STRIATE", grammar: "adj.", definition: "Marqué de stries parallèles, de fines rayures régulières." },
    { word: "SUBSTRAT", grammar: "n. m.", definition: "Couche profonde qui sert de support à une autre ; base fondamentale." },
    { word: "SUNLIGHT", grammar: "n. m.", definition: "Lumière intense artificielle utilisée dans le cinéma et la photographie." },
    { word: "SYCAMORE", grammar: "n. m.", definition: "Grand érable aux feuilles lobées ; figuier d'Orient à bois imputrescible." },
    { word: "SYLVESTRE", grammar: "adj.", definition: "Qui vit ou croît dans les forêts ; relatif aux bois et aux forêts." },
    { word: "SYMBIOSE", grammar: "n. f.", definition: "Association durable et mutuellement bénéfique entre deux organismes vivants." },
    { word: "TALUS", grammar: "n. m.", definition: "Terrain en pente douce ; dépôt de matériaux formant une rampe naturelle." },
    { word: "TARENTULE", grammar: "n. f.", definition: "Grande araignée du sud de l'Europe, dont la morsure est douloureuse." },
    { word: "TOUNDRA", grammar: "n. f.", definition: "Formation végétale des régions arctiques, sans arbres, aux sols gelés en profondeur." },
    { word: "TOURELLE", grammar: "n. f.", definition: "Petite tour ajoutée à un édifice ; cabine blindée rotative sur un char." },
    { word: "TREMBLE", grammar: "n. m.", definition: "Arbre de la famille du peuplier, dont les feuilles frémissent au moindre vent." },
    { word: "TRIDENT", grammar: "n. m.", definition: "Fourche à trois dents, arme de Poséidon ; outil de pêche à trois pointes." },
    { word: "TROGLODYTE", grammar: "n. m.", definition: "Habitant des cavernes préhistoriques ; oiseau très petit au chant puissant." },
    { word: "TRONÇON", grammar: "n. m.", definition: "Partie coupée d'une chose allongée ; section d'une route ou d'une ligne." },
    { word: "TURBINE", grammar: "n. f.", definition: "Moteur à rotation dont les aubes sont mises en mouvement par un fluide." },
    { word: "TURQUOISE", grammar: "n. f.", definition: "Pierre précieuse d'un bleu-vert caractéristique ; cette couleur." },
    { word: "ULTIME", grammar: "adj.", definition: "Qui est le dernier, qui vient en fin de quelque chose." },
    { word: "UNIVERS", grammar: "n. m.", definition: "L'ensemble de tout ce qui existe ; monde, espace infini et ses constituants." },
    { word: "VAGABOND", grammar: "n. m./adj.", definition: "Personne sans domicile fixe qui erre de lieu en lieu ; esprit libre." },
    { word: "VALISE", grammar: "n. f.", definition: "Bagage rectangulaire rigide muni d'une poignée, pour voyager." },
    { word: "VAMPIRE", grammar: "n. m.", definition: "Mort-vivant légendaire qui se nourrit du sang des vivants la nuit." },
    { word: "VANILLE", grammar: "n. f.", definition: "Épice tirée d'une orchidée tropicale, utilisée pour aromatiser." },
    { word: "VAUTOUR", grammar: "n. m.", definition: "Grand rapace charognard aux ailes immenses, au crâne souvent déplumé." },
    { word: "VELOURS", grammar: "n. m.", definition: "Tissu à surface douce et épaisse formée de poils coupés court." },
    { word: "VENIN", grammar: "n. m.", definition: "Substance toxique produite par certains animaux et injectée par morsure." },
    { word: "VERTIGE", grammar: "n. m.", definition: "Sensation de perdre l'équilibre ; trouble causé par la hauteur ou la rapidité." },
    { word: "VIADUC", grammar: "n. m.", definition: "Grand pont à arches multiples permettant de franchir une vallée ou un bras de mer." },
    { word: "VITRAIL", grammar: "n. m.", definition: "Panneau décoratif fait de morceaux de verre coloré assemblés avec du plomb." },
    { word: "VIVACE", grammar: "adj.", definition: "Qui vit longtemps ; plante revenant chaque année sans être replantée." },
    { word: "VOLCAN", grammar: "n. m.", definition: "Relief terrestre résultant de l'émission de matériaux en fusion depuis le manteau." },
    { word: "VOÛTE", grammar: "n. f.", definition: "Construction en arc de cercle formant un plafond courbé." },
    { word: "VULTURE", grammar: "n. m.", definition: "Dans la mythologie, vautour envoyé pour tourmenter Prométhée enchaîné." },
    { word: "XÉNON", grammar: "n. m.", definition: "Gaz rare de l'atmosphère, utilisé dans les lampes à haute intensité." },
    { word: "ZÉNITH", grammar: "n. m.", definition: "Point du ciel situé directement au-dessus de l'observateur ; sommet, apogée." },
    { word: "ZEUGME", grammar: "n. m.", definition: "Figure de style reliant un mot à deux autres dont il ne s'accorde qu'à l'un." },
    { word: "ZIGZAG", grammar: "n. m.", definition: "Ligne brisée formant des angles alternés en sens contraire." },
    { word: "ZINC", grammar: "n. m.", definition: "Métal gris-bleuté utilisé en couverture de toits et dans les alliages." },
    { word: "ZODIAQUE", grammar: "n. m.", definition: "Zone circulaire du ciel traversée par le Soleil, divisée en douze signes." }
  ];

  // Sort pool
  POOL.sort((a, b) => a.word.localeCompare(b.word, 'fr'));

  // Pick 20 consecutive words using seeded rng
  const rng2 = seededRng(seed);
  rng2(); rng2(); // advance state
  const maxIdx = POOL.length - 21;
  const startIdx = Math.floor(rng2() * maxIdx);
  const selected = POOL.slice(startIdx, startIdx + 20);

  //const today = new Date().toISOString().split('T')[0];
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
  // Hide loading
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 600);

  // Date
  const d = new Date(PUZZLE.date + 'T12:00:00');
  document.getElementById('todayDate').textContent =
    d.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });

  // Page range
  const first = PUZZLE.words[0].word;
  const last = PUZZLE.words[PUZZLE.words.length - 1].word;
  document.getElementById('pageRange').textContent = `${first} — ${last}`;

  // Hidden = all except first and last
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

    // Entry number
    const num = document.createElement('span');
    num.className = 'entry-num';
    num.textContent = String(i + 1).padStart(2, '0');
    div.appendChild(num);

    // Word column
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

    // Definition column
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

    // Hint button
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
//  INPUT — no autocomplete to avoid spoilers
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

  // Normalize: uppercase, remove accents for comparison
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

  // Match with or without accents
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
