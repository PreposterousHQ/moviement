'use strict';

const fs   = require('fs');
const path = require('path');

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL   = process.env.MODEL || 'claude-sonnet-4-6';

function loadContext() {
  const candidates = [
    path.join(__dirname, 'context/movement.md'),
    path.join(__dirname, '../../netlify/functions/context/movement.md'),
    path.join(process.cwd(), 'netlify/functions/context/movement.md'),
  ];
  for (const p of candidates) {
    try { return fs.readFileSync(p, 'utf8'); } catch (_) {}
  }
  return '(movement.md not found)';
}

const MOVEMENT = loadContext();

function buildMapSummary(mapState) {
  if (!mapState) return '';
  try {
    const children    = Array.isArray(mapState.children)    ? mapState.children    : [];
    const ingredients = mapState.ingredients && typeof mapState.ingredients === 'object' ? mapState.ingredients : {};
    const resonances  = mapState.resonances  && typeof mapState.resonances  === 'object' ? mapState.resonances  : {};

    if (children.length === 0) return '\n\n## Mind-map state\nNo holons in the map yet.';

    let s = `\n\n## Mind-map state (live snapshot — ${children.length} holon${children.length !== 1 ? 's' : ''})\n`;
    children.forEach(function(c) {
      const id    = c.id || c.refId || '?';
      const title = c.title || c.name || 'Untitled';
      s += `\n### ${title} (id: ${id})\n`;
      if (c.subtitle)                    s += `Subtitle: ${c.subtitle}\n`;
      if (c.bio || c.description)        s += `Description: ${(c.bio || c.description).slice(0, 400)}\n`;
      const ing = ingredients[id] || ingredients[c.refId] || [];
      if (ing.length)  s += `Ingredients: ${ing.map(function(i){ return i.text || i; }).join(' · ')}\n`;
      const res = resonances[id]  || resonances[c.refId]  || {};
      const rks = Object.keys(res).filter(function(k){ return res[k]; });
      if (rks.length)  s += `Resonates with: ${rks.join(', ')}\n`;
      if (c.children && c.children.length) {
        s += `Sub-holons: ${c.children.map(function(sc){ return sc.title || sc.name || sc.id; }).join(', ')}\n`;
      }
    });
    return s;
  } catch (_) {
    return '\n\n(Map state parse error)';
  }
}

function buildSystem(mapState) {
  return `You are **MHRC Mind** — the AI intelligence living inside the Mental Health Reformation Consortium's strategic mind-map. You know this project, its philosophy, its co-stars, and the exact current state of the map.

${MOVEMENT}
${buildMapSummary(mapState)}

## Modes
- **holon**: You're asked about a specific episode/co-star. Connect this holon to the whole — how does this person's thread serve the arc? What does this episode unlock?
- **edit**: Help draft or improve content for a holon. Match the movement's voice precisely.
- **universal**: Speak to the whole map — strategic, connective, visionary.

Keep replies conversational. 2–4 paragraphs unless asked for more. No bullet walls. Speak from inside the work.`;
}

// ---------------------------------------------------------------------------
// Access control. This endpoint spends the Anthropic key, so it answers only
// the page that carries it: the production origin, or a local dev server.
// A request with no Origin header at all (curl, scripts) is refused too —
// every browser POST carries one, so nothing legitimate is lost.
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  'https://moviement.productions',
  'https://www.moviement.productions',
]);

function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // `netlify dev` and plain static servers, any port.
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsFor(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary':                         'Origin',
    'Content-Type':                 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Rate limit: 20 requests per IP per 10 minutes, sliding window, in memory.
// Module scope lives as long as the warm function instance and no longer —
// a cold start forgets, and parallel instances do not share. That is the
// trade for having no external store: the limit is per instance, not global,
// which is still enough to stop one script from draining the key.
// ---------------------------------------------------------------------------
const RL_LIMIT     = 20;
const RL_WINDOW_MS = 10 * 60 * 1000;
const hits         = new Map(); // ip -> [timestamps within the window]

function clientIp(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip']
      || (h['x-forwarded-for'] || '').split(',')[0].trim()
      || 'unknown';
}

// Returns 0 if allowed, otherwise the number of seconds until the window opens.
function rateLimited(ip) {
  const now    = Date.now();
  const recent = (hits.get(ip) || []).filter(function(t) { return now - t < RL_WINDOW_MS; });
  if (recent.length >= RL_LIMIT) {
    hits.set(ip, recent);
    return Math.ceil((recent[0] + RL_WINDOW_MS - now) / 1000);
  }
  recent.push(now);
  hits.set(ip, recent);
  // Keep a long-lived instance from accumulating every IP it has ever seen.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some(function(t) { return now - t < RL_WINDOW_MS; })) hits.delete(k);
    }
  }
  return 0;
}

exports.handler = async function(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (!originAllowed(origin)) {
    return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Forbidden' }) };
  }
  const CORS = corsFor(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const retryIn = rateLimited(clientIp(event));
  if (retryIn) {
    return {
      statusCode: 429,
      headers: Object.assign({ 'Retry-After': String(retryIn) }, CORS),
      body: JSON.stringify({ error: 'Too many requests. Try again in a few minutes.' }),
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { message, mode = 'universal', holonContext, mapState, history = [] } = body;
  if (!message || typeof message !== 'string') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: '"message" required' }) };
  }

  let userContent = message;
  if (mode === 'holon' && holonContext) {
    const hc = holonContext;
    userContent = `[Holon context: "${hc.title || hc.name}"${hc.subtitle ? ` — ${hc.subtitle}` : ''}${hc.bio ? `\nDescription: ${hc.bio}` : ''}]\n\n${message}`;
  } else if (mode === 'edit' && holonContext) {
    userContent = `[Edit assist — holon: "${holonContext.title || holonContext.name}"]\nExisting content: ${JSON.stringify(holonContext, null, 2)}\n\nRequest: ${message}`;
  }

  const messages = [
    ...history.slice(-30).map(function(h) { return { role: h.role, content: String(h.content) }; }),
    { role: 'user', content: userContent },
  ];

  const payload = {
    model:      MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: buildSystem(mapState), cache_control: { type: 'ephemeral' } }],
    messages,
  };

  let res;
  try {
    res = await fetch(API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Upstream failed', detail: err.message }) };
  }

  const raw = await res.json();
  if (!res.ok) {
    return { statusCode: res.status, headers: CORS, body: JSON.stringify({ error: raw.error?.message || 'Anthropic API error', raw }) };
  }

  const reply = raw.content?.[0]?.text || '';
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply }) };
};
