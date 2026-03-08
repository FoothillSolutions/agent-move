/** Pixel-art character color palettes (12 palettes) */
export interface AgentPalette {
  name: string;
  body: number;     // clothing / shirt
  outline: number;  // outlines, pants, shoes
  highlight: number; // hair
  eye: number;      // eye whites / iris
  skin: number;     // face and hands
}

export const AGENT_PALETTES: AgentPalette[] = [
  { name: 'blue',    body: 0x4a90d9, outline: 0x2c5a8a, highlight: 0x7ab8f5, eye: 0xffffff, skin: 0xffdbac },
  { name: 'green',   body: 0x4caf50, outline: 0x2e7d32, highlight: 0x81c784, eye: 0xffffff, skin: 0xffdbac },
  { name: 'red',     body: 0xe57373, outline: 0xc62828, highlight: 0xffcdd2, eye: 0xffffff, skin: 0xffdbac },
  { name: 'purple',  body: 0xab47bc, outline: 0x6a1b9a, highlight: 0xce93d8, eye: 0xffffff, skin: 0xffdbac },
  { name: 'orange',  body: 0xff9800, outline: 0xe65100, highlight: 0xffcc80, eye: 0xffffff, skin: 0xffdbac },
  { name: 'cyan',    body: 0x26c6da, outline: 0x00838f, highlight: 0x80deea, eye: 0xffffff, skin: 0xffdbac },
  { name: 'pink',    body: 0xf06292, outline: 0xc2185b, highlight: 0xf8bbd0, eye: 0xffffff, skin: 0xffdbac },
  { name: 'teal',    body: 0x26a69a, outline: 0x00695c, highlight: 0x80cbc4, eye: 0xffffff, skin: 0xffdbac },
  { name: 'amber',   body: 0xffc107, outline: 0xff8f00, highlight: 0xffe082, eye: 0x333333, skin: 0xffdbac },
  { name: 'indigo',  body: 0x5c6bc0, outline: 0x283593, highlight: 0x9fa8da, eye: 0xffffff, skin: 0xffdbac },
  { name: 'lime',    body: 0x9ccc65, outline: 0x558b2f, highlight: 0xc5e1a5, eye: 0x333333, skin: 0xffdbac },
  { name: 'brown',   body: 0x8d6e63, outline: 0x4e342e, highlight: 0xbcaaa4, eye: 0xffffff, skin: 0xffdbac },
];

/** Background and UI colors */
export const COLORS = {
  background: 0x1a1e38,
  gridLine: 0x16213e,
  zoneBackground: 0x0f3460,
  zoneBorder: 0xe94560,
  text: 0xffffff,
  textDim: 0x888888,
  speechBubble: 0xffffff,
  speechText: 0x1a1a2e,
  relationshipLine: 0x555555,
  teamLine: 0x44ff44,
} as const;

/** Model pricing per million tokens (USD) */
export interface ModelPricing {
  input: number;
  output: number;
}

// ─── Pricing table (USD per million tokens) ──────────────────────────────────
// Sources: official provider pricing pages (as of mid-2025).
// Use getModelPricing() for lookups — it handles prefix/fuzzy matching.

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ── Anthropic Claude ────────────────────────────────────────────────────────
  'claude-opus-4-6':           { input: 15,    output: 75    },
  'claude-opus-4-5-20250620':  { input: 15,    output: 75    },
  'claude-sonnet-4-6':         { input: 3,     output: 15    },
  'claude-sonnet-4-5-20250514':{ input: 3,     output: 15    },
  'claude-sonnet-4-0-20250514':{ input: 3,     output: 15    },
  'claude-haiku-4-5-20251001': { input: 1,     output: 5     },
  'claude-3-7-sonnet-20250219':{ input: 3,     output: 15    },
  'claude-3-5-sonnet-20241022':{ input: 3,     output: 15    },
  'claude-3-5-haiku-20241022': { input: 1,     output: 5     },
  'claude-3-opus-20240229':    { input: 15,    output: 75    },

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  'gpt-4o':                    { input: 2.5,   output: 10    },
  'gpt-4o-mini':               { input: 0.15,  output: 0.6   },
  'gpt-4-turbo':               { input: 10,    output: 30    },
  'gpt-4':                     { input: 30,    output: 60    },
  'o1':                        { input: 15,    output: 60    },
  'o1-mini':                   { input: 1.1,   output: 4.4   },
  'o3':                        { input: 10,    output: 40    },
  'o3-mini':                   { input: 1.1,   output: 4.4   },
  'o4-mini':                   { input: 1.1,   output: 4.4   },

  // ── Google Gemini ───────────────────────────────────────────────────────────
  'gemini-2.5-pro':            { input: 1.25,  output: 10    },
  'gemini-2.5-flash':          { input: 0.15,  output: 0.6   },
  'gemini-2.0-flash':          { input: 0.1,   output: 0.4   },
  'gemini-2.0-flash-lite':     { input: 0.075, output: 0.3   },
  'gemini-1.5-pro':            { input: 1.25,  output: 5     },
  'gemini-1.5-flash':          { input: 0.075, output: 0.3   },

  // ── DeepSeek ────────────────────────────────────────────────────────────────
  'deepseek-chat':             { input: 0.27,  output: 1.1   }, // DeepSeek V3
  'deepseek-reasoner':         { input: 0.55,  output: 2.19  }, // DeepSeek R1

  // ── xAI Grok ────────────────────────────────────────────────────────────────
  'grok-3':                    { input: 3,     output: 15    },
  'grok-3-mini':               { input: 0.3,   output: 0.5   },
  'grok-2':                    { input: 2,     output: 10    },

  // ── Mistral ─────────────────────────────────────────────────────────────────
  'mistral-large':             { input: 2,     output: 6     },
  'mistral-small':             { input: 0.1,   output: 0.3   },
  'codestral':                 { input: 0.1,   output: 0.3   },
};

/** Default pricing when model is unknown (mid-range estimate) */
export const DEFAULT_PRICING: ModelPricing = { input: 3, output: 15 };

/** Context window sizes in tokens for major models */
const CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic (200k across all current Claude models)
  'claude': 200_000,
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'o1': 200_000,
  'o1-mini': 128_000,
  'o3': 200_000,
  'o3-mini': 200_000,
  'o4-mini': 200_000,
  // Google (1M for Gemini 2.x, 2M for 1.5 Pro — use 1M as display cap)
  'gemini-2': 1_000_000,
  'gemini-1.5': 1_000_000,
  // DeepSeek
  'deepseek-chat': 64_000,
  'deepseek-reasoner': 128_000,
  // xAI
  'grok-3': 131_072,
  'grok-2': 131_072,
  // Mistral
  'mistral-large': 128_000,
  'mistral-small': 32_000,
  'codestral': 256_000,
};

/** Get pricing for a model string (fuzzy match) */
export function getModelPricing(model: string | null): ModelPricing {
  if (!model) return DEFAULT_PRICING;
  const m = model.toLowerCase();
  // Exact match
  if (MODEL_PRICING[m]) return MODEL_PRICING[m];
  // Prefix/substring match against known keys
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (m.startsWith(key) || m.includes(key)) return pricing;
  }
  // Family fallbacks
  if (m.includes('opus'))    return MODEL_PRICING['claude-opus-4-6'];
  if (m.includes('haiku'))   return MODEL_PRICING['claude-haiku-4-5-20251001'];
  if (m.includes('sonnet'))  return MODEL_PRICING['claude-sonnet-4-6'];
  if (m.includes('o3-mini') || m.includes('o4-mini')) return MODEL_PRICING['o3-mini'];
  if (m.includes('o1-mini')) return MODEL_PRICING['o1-mini'];
  if (m.includes('gemini-2.5')) return MODEL_PRICING['gemini-2.5-pro'];
  if (m.includes('gemini-2'))   return MODEL_PRICING['gemini-2.0-flash'];
  if (m.includes('gemini'))     return MODEL_PRICING['gemini-1.5-pro'];
  if (m.includes('gpt-4o'))     return MODEL_PRICING['gpt-4o'];
  if (m.includes('deepseek'))   return MODEL_PRICING['deepseek-chat'];
  if (m.includes('grok'))       return MODEL_PRICING['grok-3'];
  if (m.includes('mistral'))    return MODEL_PRICING['mistral-large'];
  return DEFAULT_PRICING;
}

/** Get context window size in tokens for a model (fuzzy match, defaults to 200k) */
export function getContextWindow(model: string | null): number {
  if (!model) return 200_000;
  const m = model.toLowerCase();
  // Exact key match
  if (CONTEXT_WINDOWS[m]) return CONTEXT_WINDOWS[m];
  // Prefix match (longest key that m starts with)
  let best: [string, number] | null = null;
  for (const [key, size] of Object.entries(CONTEXT_WINDOWS)) {
    if (m.startsWith(key) || m.includes(key)) {
      if (!best || key.length > best[0].length) best = [key, size];
    }
  }
  if (best) return best[1];
  return 200_000;
}

/** Deterministic hash of project path to a palette index (agents from same project share color) */
export function getProjectColorIndex(projectPath: string): number {
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    hash = ((hash << 5) - hash + projectPath.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AGENT_PALETTES.length;
}

/** Compute cost for an agent's token usage (in dollars) */
export function computeAgentCost(tokens: {
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string | null;
}): number {
  const pricing = getModelPricing(tokens.model);
  return (tokens.totalInputTokens / 1_000_000) * pricing.input +
         (tokens.totalOutputTokens / 1_000_000) * pricing.output +
         (tokens.cacheReadTokens / 1_000_000) * pricing.input * 0.1 +
         (tokens.cacheCreationTokens / 1_000_000) * pricing.input * 1.25;
}
