export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { track, artist, mode } = req.body;
    if (!artist) return res.status(400).json({ error: 'Missing artist' });

    // --- ANNÉE : MusicBrainz d'abord, Groq en fallback ---
    if (!mode && track && track !== '__members__') {
      // 1. Essayer MusicBrainz
      try {
        const q = encodeURIComponent(`${track} ${artist}`);
        console.log('Calling MusicBrainz...');
        const mbRes = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${q}&limit=10&fmt=json`, {
          headers: { 'User-Agent': 'BlindspotBingo/1.0 (contact@blindspot.app)' }
        });
        const mbData = await mbRes.json();
        const recordings = mbData.recordings || [];
        console.log('MB response score0:', recordings[0]?.score, 'title:', recordings[0]?.title);

        // Prendre le first-release-date du recording avec le meilleur score et titre le plus proche
        let bestYear = null;
        const trackLower = track.toLowerCase();
        // Trier par similarité du titre d'abord, puis score
        const sorted = recordings
          .filter(r => r.score >= 60)
          .sort((a, b) => {
            const aExact = a.title.toLowerCase() === trackLower ? 1 : 0;
            const bExact = b.title.toLowerCase() === trackLower ? 1 : 0;
            if (aExact !== bExact) return bExact - aExact;
            return b.score - a.score;
          });
        for (const rec of sorted) {
          const date = rec['first-release-date'] || rec.releases?.[0]?.date || '';
          const y = date.substring(0, 4);
          if (y.match(/^\d{4}$/) && y > '1900') { bestYear = y; break; }
        }

        console.log('MB bestYear:', bestYear, 'recordings count:', recordings.length);
        if (bestYear) return res.status(200).json({ year: bestYear, source: 'musicbrainz' });
      } catch(e) {
        console.log('MusicBrainz exception:', e.message);
      }

      // 2. Fallback Groq si MusicBrainz ne trouve rien
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 10,
          temperature: 0,
          messages: [{ role: 'user', content: `You are a music metadata expert. What year was "${track}" by ${artist} first officially released (not remasters or compilations)? Reply ONLY with the 4-digit year or UNKNOWN.` }]
        })
      });
      const groqData = await groqRes.json();
      const text = groqData.choices?.[0]?.message?.content?.trim() || '';
      const year = text === 'UNKNOWN' ? null : (text.match(/\d{4}/)?.[0] || null);
      return res.status(200).json({ year, source: 'groq' });
    }

    // --- MEMBRES ---
    if (track === '__members__') {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 10,
          temperature: 0,
          messages: [{ role: 'user', content: `You are a music historian. How many official members does "${artist}" have? Solo = 1. Return ONLY a number or UNKNOWN.` }]
        })
      });
      const groqData = await groqRes.json();
      const text = groqData.choices?.[0]?.message?.content?.trim() || '';
      const year = text === 'UNKNOWN' ? null : (text.match(/\d+/)?.[0] || null);
      return res.status(200).json({ year });
    }

    // --- FUNFACT ---
    if (mode === 'funfact') {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 400,
          temperature: 0.6,
          messages: [{ role: 'user', content: `You are a music trivia expert. Generate ONE multiple choice question about "${track}" by ${artist}.
RULES: NEVER ask about album or release year. NEVER ask about the name of the artist or the title of the song. Only use facts you are 100% certain about. Question types: chart positions, collaborators, samples, awards, producers, music video, certifications, stories behind the song.
Return ONLY this JSON, no markdown, all text in French: {"question":"...","choices":["A","B","C","D"],"answer":0}` }]
        })
      });
      const groqData = await groqRes.json();
      const text = groqData.choices?.[0]?.message?.content?.trim() || '';
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

    res.status(400).json({ error: 'Unknown mode' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
