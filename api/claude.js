export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { track, artist } = req.body;
    if (!track || !artist) return res.status(400).json({ error: 'Missing track or artist' });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `What year was the song "${track}" by ${artist} originally released? Reply with only the 4-digit year, nothing else.`
        }]
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const year = text.match(/\d{4}/)?.[0] || null;
    res.status(200).json({ year, debug: text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
