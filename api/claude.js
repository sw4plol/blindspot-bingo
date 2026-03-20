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
    let model = 'llama-3.3-70b-versatile';
    let max_tokens = 10;
    let temperature = 0;

    if (mode === 'funfact') {
      model = 'llama-3.3-70b-versatile';
      max_tokens = 500;
      temperature = 0.5;
      prompt = `You are a music trivia expert. Generate ONE multiple choice question about "${track}" by ${artist}.

STRICT RULES:
- NEVER ask about which album a song is on
- NEVER ask about release year
- NEVER invent facts — only use facts you are 100% certain about
- If you are not confident about a fact, choose a different angle
- Question types allowed: music video details, chart positions, collaborators, samples used, awards won, interesting stories behind the song, record labels, producers, inspired by events, certifications (gold/platinum)
- All 4 choices must be plausible
- Make no spelling mistakes

Return ONLY this exact JSON, no thinking, no explanation, no markdown:
{"question":"...","choices":["A","B","C","D"],"answer":0}

"answer" = index (0-3) of the correct choice.`;

    } else if (track === '__members__') {
      prompt = `You are a music historian.
Task: How many official members does the band or artist "${artist}" have at their peak / current lineup?
Instructions:
1. Count ONLY official members, not touring or session musicians.
2. If it's a solo artist, return 1.
3. If the artist is less known, make sure you have enough information without mistakes.
4. Don't hesitate to double check your own answer so you know you truly have the right one.
5. If truly unknown, output: UNKNOWN
Output rules:
- Return ONLY: a single integer (e.g., 4) OR UNKNOWN. No text, no explanation.`;

    } else {
      prompt = `You are a music metadata expert with strong reasoning ability.
Task: Determine the original official release year of a song given its title and artist.
Instructions:
1. Prioritize the FIRST official release (not remasters, reuploads, or compilations).
2. If the song is underground or not well documented: infer the most likely year using context (artist activity period, album releases, style era).
3. If multiple possible years exist, choose the most probable ONE.
4. If the artist is less known, make sure you have enough information for better questions without mistakes.
5. Don't hesitate to double check your own answer so you know you truly have the right one.
6. If the song truly cannot be identified, output exactly: UNKNOWN
Output rules:
- Return ONLY one of the following: a 4-digit year (e.g., 2013) OR UNKNOWN. No text, no explanation, no punctuation.

Song: "${track}"
Artist: ${artist}`;
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY
      },
      body: JSON.stringify({
        model,
        max_tokens,
        temperature,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content?.trim() || '';
    

    if (mode === 'funfact') {
      // Enlever le bloc <think>...</think> de deepseek
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      // Extraire le JSON même s'il y a du texte autour
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

    const year_result = text === 'UNKNOWN' ? null : (text.match(/\d+/)?.[0] || null);
    res.status(200).json({ year: year_result });
  } catch (e) {
    console.log('Exception:', e.message);
    res.status(500).json({ error: e.message });
  }
}
