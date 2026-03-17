export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { action, prefix, word, limit } = req.query;

  try {
    if (action === 'list') {
      const url = `https://fr.wiktionary.org/w/api.php?action=query&list=allpages&apprefix=${encodeURIComponent(prefix)}&apnamespace=0&aplimit=500&apminsize=200&format=json&origin=*`;
      const response = await fetch(url);
      const data = await response.json();

      const clean = data.query.allpages
        .map(p => p.title)
        // Only plain words: letters + French accents, 4-11 chars, no spaces/symbols
        .filter(w => /^[a-zA-ZÀ-ÿœæŒÆ]{4,11}$/.test(w))
        // Exclude proper nouns (capitalized) and acronyms (all caps)
        // Keep only lowercase entries (real common words in Wiktionary are lowercase)
        .filter(w => w[0] === w[0].toLowerCase())
        .map(w => w.toUpperCase());

      res.status(200).json({ words: clean });

    } else if (action === 'define') {
      const url = `https://fr.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`;
      const response = await fetch(url);
      const data = await response.json();

      const pages = data.query.pages;
      const page = Object.values(pages)[0];

      if (!page.revisions) return res.status(200).json({ result: null });

      const wikitext = page.revisions[0].slots.main['*'];

      // Split on language sections and find French one
      const sections = wikitext.split(/(?=== \{\{langue\|)/);
      const frSection = sections.find(s => s.startsWith('== {{langue|fr}}'));
      if (!frSection) return res.status(200).json({ result: null });

      // Detect grammar type
      let grammar = '—';
      if (/\{\{S\|nom/.test(frSection)) grammar = 'n.';
      else if (/\{\{S\|verbe/.test(frSection)) grammar = 'v.';
      else if (/\{\{S\|adjectif/.test(frSection)) grammar = 'adj.';
      else if (/\{\{S\|adverbe/.test(frSection)) grammar = 'adv.';
      else if (/\{\{S\|pronom/.test(frSection)) grammar = 'pron.';
      else if (/\{\{S\|préposition/.test(frSection)) grammar = 'prép.';

      // Find first real definition line (starts with # but not ## or #* or #:)
      const defLine = frSection.split('\n').find(l => /^# [^#*:;]/.test(l));
      if (!defLine) return res.status(200).json({ result: null });

      let def = defLine.replace(/^# /, '');
      // Clean wiki markup
      def = def.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2');
      def = def.replace(/\{\{[^}]+\}\}/g, '');
      def = def.replace(/'{2,3}/g, '');
      def = def.replace(/<[^>]+>/g, '');
      def = def.replace(/\s+/g, ' ').trim();
      if (def) def = def.charAt(0).toUpperCase() + def.slice(1);
      if (def && !def.endsWith('.')) def += '.';

      if (!def || def.length < 8 || def.length > 250) {
        return res.status(200).json({ result: null });
      }

      res.status(200).json({ result: { grammar, definition: def } });

    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
