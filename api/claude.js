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

    if (mode === 'funfact') {
      prompt = `Generate a fun fact quiz question about the song "${track}" by ${artist}.
Return ONLY a valid JSON object with this exact format, no explanation, no markdown:
{"question":"...","choices":["A","B","C","D"],"answer":0}
Where "answer" is the index (0-3) of the correct choice in the "choices" array.
The question should be interesting and specific (album name, collaborator, inspiration, record, anecdote). 
Make the 3 wrong answers plausible but clearly wrong. Be precise and accurate. Make no mistakes in spellings and informations. Don't hesitate to double check your own answer so you know you truly have the right one. If the artist is less known, make sure you have enough informations for better questions without mistakes.`;
    } else if (track === '__members__') {
      prompt = `How many members does the music artist or band "${artist}" have? If it's a solo artist, reply "1". Reply with only a single number, nothing else. Be as precise as possible, make no mistakes. Don't hesitate to double check your own answer so you know you truly have the right one. If the artist is less known, make sure you have enough informations for the right answer. `;
    } else {
      prompt = `What year was "${track}" by ${artist} first released as a single or on an album? Ignore remasters, live versions, and compilations. Reply with only the 4-digit year, nothing else. Be as precise as possible, make no mistakes. Don't hesitate to double check your own answer so you know you truly have the right one. If the artist is less known, make sure you have enough informations for the right answer.`;
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

    const year = text.match(/\d+/)?.[0] || null;
    res.status(200).json({ year });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
