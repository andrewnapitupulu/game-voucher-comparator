'use strict';

const { GAME_BY_ID, listGames } = require('../config/games');

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const textParts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') textParts.push(content.text);
    }
  }
  return textParts.join('\n');
}

async function resolveGameWithAi(query, { timeoutMs = 5000 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const allowed = listGames().map((game) => `${game.id}: ${game.name}`).join('\n');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        store: false,
        input: [
          {
            role: 'system',
            content: 'Pilih tepat satu game dari daftar. Balas hanya ID game. Bila tidak cocok, balas unknown.'
          },
          {
            role: 'user',
            content: `Daftar game:\n${allowed}\n\nQuery pengguna: ${String(query).slice(0, 120)}`
          }
        ],
        max_output_tokens: 20
      })
    });

    if (!response.ok) return null;
    const payload = await response.json();
    const answer = extractOutputText(payload).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    return GAME_BY_ID[answer] || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { resolveGameWithAi };
