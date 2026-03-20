export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { track, artist, mode } = req.body;
    if (!artist) return res.status(400).json({ error: 'Missing artist' });

    let prompt;
    let max_tokens = 10;

    if (mode === 'funfact') {
      max_tokens = 400;
      prompt = `You are a music trivia expert. Generate ONE multiple choice question about "${track}" by ${artist}.
RULES: NEVER ask about album, release year, the name of the artist or the title of the song. Only use facts you are 100% certain about. Question types: chart positions, collaborators, samples, awards, producers, music video, certifications, stories behind the song.
Return ONLY this JSON, no markdown, all text in French: {"question":"...","choices":["A","B","C","D"],"answer":0}`;

    } else if (track === '__members__') {
      prompt = `How many official members does "${artist}" have? Solo = 1. Return ONLY a number or UNKNOWN. No text, no explanation.`;

    } else {
      prompt = `What year was "${track}" by ${artist} first officially released? Prioritize the original release, not remasters or compilations. Reply ONLY with the 4-digit year or UNKNOWN.`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || '';
    console.log('anthropic text:', text, 'error:', data.error);

    if (mode === 'funfact') {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.question && Array.isArray(parsed.choices) && parsed.choices.length === 4) {
            return res.status(200).json(parsed);
          }
        } catch(e) {}
      }
      return res.status(200).json({ question: null });
    }

    const year = text === 'UNKNOWN' ? null : (text.match(/\d+/)?.[0] || null);
    res.status(200).json({ year });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
