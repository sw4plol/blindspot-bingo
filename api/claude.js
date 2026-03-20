export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { track, artist, mode, year } = req.body;
    if (!artist) return res.status(400).json({ error: 'Missing artist' });

    let prompt;

    if (mode === 'funfact') {
      prompt = `You are a music trivia expert.
Task: Generate a fun fact quiz question about the song "${track}" by ${artist}.
Instructions:
1. The question must be specific and interesting (album name, chart position, collaborator, inspiration, record, anecdote).
2. Make the 3 wrong answers plausible but clearly wrong.
3. Be precise and accurate. Make no mistakes in spellings and informations.
4. If the artist is less known, make sure you have enough information for better questions without mistakes.
5. Don't hesitate to double check your own answer so you know you truly have the right one.
Output rules:
- Return ONLY a valid JSON object with this exact format, no explanation, no markdown:
{"question":"...","choices":["A","B","C","D"],"answer":0}
Where "answer" is the index (0-3) of the correct choice.`;

    } else if (track === '__members__') {
      const releaseYear = year || new Date().getFullYear();
      prompt = `You are a music historian specializing in band lineups over time.
Task: Given a music group and a specific year, determine how many official members were in the group DURING that year.
Instructions:
1. Count ONLY members officially part of the group in that exact year.
2. Exclude past members who had already left before that year.
3. Exclude future members who had not yet joined.
4. Do NOT include touring or session musicians.
5. If a member joined or left during that year, count them ONLY if they were part of the group for a significant portion of that year.
6. Use historically accurate lineup timelines when possible.
7. If the group or year cannot be reliably determined, output exactly: UNKNOWN
8. If the artist is less known, make sure you have enough information without mistakes.
9. Don't hesitate to double check your own answer so you know you truly have the right one.
Output rules:
- Return ONLY: a single integer (e.g., 4) OR UNKNOWN. No text, no explanation.

Artist: ${artist}
Year: ${releaseYear}`;

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
        model: 'llama-3.3-70b-versatile',
        max_tokens: mode === 'funfact' ? 300 : 10,
        temperature: mode === 'funfact' ? 0.7 : 0,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    if (mode === 'funfact') {
      try {
        const clean = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        return res.status(200).json(parsed);
      } catch(e) {
        return res.status(200).json({ question: null });
      }
    }

    const year_result = text === 'UNKNOWN' ? null : (text.match(/\d+/)?.[0] || null);
    res.status(200).json({ year: year_result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
