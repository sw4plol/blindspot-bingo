export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { track, artist } = req.body;
    if (!track || !artist) return res.status(400).json({ error: 'Missing track or artist' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `What year was the song "${track}" by ${artist} originally released? Reply with only the 4-digit year, nothing else.`
        }]
      })
    });

    const data = await response.json();
    const year = data.content?.[0]?.text?.trim().match(/\d{4}/)?.[0];
    if (!year) return res.status(200).json({ year: null });
    res.status(200).json({ year });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
