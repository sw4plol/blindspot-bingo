export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path' });
  try {
    const url = 'https://api.deezer.com/' + path;
    const r = await fetch(url);
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
