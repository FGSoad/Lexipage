export default async function handler(req, res) {
  // Allow CORS from anywhere
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { action, prefix, word, limit } = req.query;

  let url;

  if (action === 'list') {
    // Fetch list of words starting with prefix
    url = `https://fr.wiktionary.org/w/api.php?action=query&list=allpages&apprefix=${encodeURIComponent(prefix)}&apnamespace=0&aplimit=${limit || 120}&apminsize=100&format=json&origin=*`;
  } else if (action === 'define') {
    // Fetch definition of a word
    url = `https://fr.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`;
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
