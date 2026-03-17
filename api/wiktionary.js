export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { action, prefix, word, limit } = req.query;

  try {
    if (action === 'list') {
      const url = `https://fr.wiktionary.org/w/api.php?action=query&list=allpages&apprefix=${encodeURIComponent(prefix)}&apnamespace=0&aplimit=${limit || 120}&apminsize=100&format=json&origin=*`;
      const response = await fetch(url);
      const data = await response.json();
      res.status(200).json(data);

    } else if (action === 'define') {
      const url = `https://fr.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`;
      const response = await fetch(url);
      const data = await response.json();

      const pages = data.query.pages;
      const page = Object.values(pages)[0];

      if (!page.revisions) {
        return res.status(200).json({ result: null });
      }

      const wikitext = page.revisions[0].slots.main['*'];

      // Extract only the French section
      const frMatch = wikitext.match(/==\s*\{\{langue\|fr\}\}\s*==([\s\S]*?)(?===\s*\{\{langue\|(?!fr))|==\s*\{\{langue\|fr\}\}\s*==([\s\S]*$)/);
      if (!frMatch) {
        return res.status(200).json({ result: null });
      }
      const frSection = frMatch[1] || frMatch[2] || '';

      // Detect grammar type
      let grammar = '—';
      if (/\{\{S\|nom/.test(frSection)) grammar = 'n.';
      else if (/\{\{S\|verbe/.test(frSection)) grammar = 'v.';
      else if (/\{\{S\|adjectif/.test(frSection)) grammar = 'adj.';
      else if (/\{\{S\|adverbe/.test(frSection)) grammar = 'adv.';
      else if (/\{\{S\|pronom/.test(frSection)) grammar = 'pron.';

      // Find first real definition line
      const lines = frSection.split('\n');
      const defLines = lines.filter(l => /^# [^#*:]/.test(l));

      if (defLines.length === 0) {
        return res.status(200).json({ result: null });
      }

      let def = defLines[0].replace(/^# /, '');
      def = def.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2');
      def = def.replace(/\{\{[^}]+\}\}/g, '');
      def = def.replace(/'{2,3}/g, '');
      def = def.replace(/<[^>]+>/g, '');
      def = def.replace(/\s+/g, ' ').trim();
      if (def) def = def.charAt(0).toUpperCase() + def.slice(1);
      if (def && !def.endsWith('.')) def += '.';

      if (!def || def.length < 5 || def.length > 250) {
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
