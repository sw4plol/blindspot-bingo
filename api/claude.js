export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { track, artist, mode } = req.body;
    if (!artist) return res.status(400).json({ error: 'Missing artist' });

    // --- ANNÉE : Discogs ---
    if (!mode && track && track !== '__members__') {
      try {
        const q = encodeURIComponent(`${track} ${artist}`);
        const discogsRes = await fetch(`https://api.discogs.com/database/search?q=${q}&type=release&per_page=5&token=${process.env.DISCOGS_TOKEN}`, {
          headers: { 'User-Agent': 'BlindspotBingo/1.0' }
        });
        const discogsData = await discogsRes.json();
        const results = discogsData.results || [];

        const remasterPattern = /remaster|reissue|anniversary|deluxe|expanded|edition|mix|iggy mix|stereo|mono|bonus/i;
        let bestYear = null;
        for (const r of results) {
          // Ignorer les remasters/rééditions
          if (remasterPattern.test(r.title || '')) continue;
          const y = r.year?.toString();
          if (y?.match(/^\d{4}$/) && y > '1900') {
            if (!bestYear || parseInt(y) < parseInt(bestYear)) bestYear = y;
          }
        }
        // Si tout filtré, prendre quand même la plus ancienne
        if (!bestYear) {
          for (const r of results) {
            const y = r.year?.toString();
            if (y?.match(/^\d{4}$/) && y > '1900') {
              if (!bestYear || parseInt(y) < parseInt(bestYear)) bestYear = y;
            }
          }
        }

        if (bestYear) return res.status(200).json({ year: bestYear });
      } catch(e) {}

      // Fallback Claude Haiku
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: `What year was "${track}" by ${artist} ORIGINALLY released (first ever release, not remasters or compilations)? Reply ONLY with the 4-digit year.` }]
        })
      });
      const claudeData = await claudeRes.json();
      const text = claudeData.content?.[0]?.text?.trim() || '';
      const year = text.match(/\d{4}/)?.[0] || null;
      return res.status(200).json({ year });
    }

    // --- MEMBRES + FUNFACT : Claude Haiku ---
    let prompt;
    let max_tokens = 10;

    if (track === '__members__') {
      prompt = `How many official members does "${artist}" have? Solo = 1. Return ONLY a number or UNKNOWN. No text, no explanation.`;
    } else if (mode === 'funfact') {
      max_tokens = 400;
      prompt = `You are a music trivia expert. Generate ONE multiple choice question about "${track}" by ${artist}.
STRICT RULES:
- NEVER ask about album, release year, the name of the artist, the title of the song, or music genre/style
- Only use facts you are 100% certain about
- Question types allowed ONLY: chart positions, collaborators, samples used, awards won, producers, music video details, certifications (gold/platinum), stories/anecdotes behind the song
- All 4 choices must be plausible
- Make no spelling mistakes
Return ONLY this JSON, no markdown, all text in French: {"question":"...","choices":["A","B","C","D"],"answer":0}`;
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
