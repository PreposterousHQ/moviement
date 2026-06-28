'use strict';

const fs   = require('fs');
const path = require('path');

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL   = process.env.MODEL || 'claude-sonnet-4-6';

/* ── load knowledge.md at cold start ── */
function loadKnowledge() {
  const candidates = [
    path.join(__dirname, 'context/knowledge.md'),          // esbuild bundle root
    path.join(__dirname, '../../context/knowledge.md'),    // local dev layout
    path.join(process.cwd(), 'context/knowledge.md'),      // cwd fallback
  ];
  for (const p of candidates) {
    try { return fs.readFileSync(p, 'utf8'); } catch (_) {}
  }
  return '(knowledge file not found — fill in context/knowledge.md)';
}

const KNOWLEDGE = loadKnowledge();

const SYSTEM_TEXT = `\
You are Board Mind — an AI thinking partner for the Scenius Wall, a visual \
remix canvas for the Civil Rights MOVIEment documentary project.

## Project knowledge
${KNOWLEDGE}

## Your job
Help the user think through the film, develop ideas, surface connections \
between cards, draft new card content, and suggest structural moves. \
A snapshot of the current board (cards and links) is appended to the user \
message inside <board_state> tags when available — use it to give grounded, \
specific answers.

## Response format — STRICT
Respond with ONLY a valid JSON object. No prose before or after. No markdown \
fences. No comments.

{"reply":"<your conversational response as plain text>","board_ops":[]}

board_ops is an array of zero or more operations:
- Create card: {"op":"create_card","card":{"lane":"<key>","type":"<type>","t":"<title>","b":"<body>","note":"<omit if empty>","links":[]}}
- Update card: {"op":"update_card","id":"<exact id from board_state>","set":{"t":"...","b":"..."}}
- Link cards:  {"op":"link_cards","a":"<card_id>","b":"<card_id>"}

Valid lane keys:   meta, open, act1, act2, act3, model, ascent, appendix, pillar, script, quest, device
Valid type values: person, artifact, beat, note, question, decision, thought, org, quote, concept, pillar, scriptbeat, quest, device

Rules:
- Only include board_ops when the user explicitly asks for board changes.
- Never invent card ids — only reference ids present in the board_state.
- Keep reply text plain — no markdown, no bullet symbols.`;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type':                 'application/json',
};

/* ── robust JSON extraction from model output ── */
function parseAIText(text) {
  const t = (text || '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch (_) {} }
  const brace = t.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch (_) {} }
  return { reply: t, board_ops: [] };
}

/* ── handler ── */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { message, board, history = [] } = body;
  if (!message || typeof message !== 'string') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: '"message" string is required' }) };
  }

  /* build user turn — attach board state as XML context */
  const userContent = board
    ? `${message}\n\n<board_state>\n${JSON.stringify(board)}\n</board_state>`
    : message;

  /* keep history to last 20 turns to stay under token limits */
  const messages = [
    ...history.slice(-20).map(h => ({ role: h.role, content: String(h.content) })),
    { role: 'user', content: userContent },
  ];

  const payload = {
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_TEXT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  };

  let anthropicRes;
  try {
    anthropicRes = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { statusCode: 502, headers: CORS,
      body: JSON.stringify({ error: 'Upstream request failed', detail: err.message }) };
  }

  const raw = await anthropicRes.json();
  if (!anthropicRes.ok) {
    return { statusCode: anthropicRes.status, headers: CORS,
      body: JSON.stringify({ error: raw.error?.message || 'Anthropic API error', raw }) };
  }

  const aiText  = raw.content?.[0]?.text || '';
  const parsed  = parseAIText(aiText);

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      reply:      typeof parsed.reply === 'string' ? parsed.reply : aiText,
      board_ops:  Array.isArray(parsed.board_ops)  ? parsed.board_ops : [],
    }),
  };
};
