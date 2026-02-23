/**
 * Single configuration for RAG + generation.
 * Defaults are mobile-tuned and can be overridden by pack rag_config.json at runtime.
 */

export interface RagConfig {
  n_predict: number;
  generation: {
    temperature: number;
    top_p: number;
    top_k: number;
    penalty_repeat: number;
  };
  chat_n_ctx: number;
  embed_n_ctx: number;
  retrieval: {
    top_k_rules: number;
    top_k_cards: number;
    top_k_merge: number;
    rules_weight: number;
    cards_weight: number;
  };
  prompt: {
    max_prompt_chars: number;
    default_max_context_chars: number;
    chars_per_token_est: number;
    system_instruction: string;
  };
  context_budget: number;
  debug: {
    excerpt_len: number;
    prompt_preview_len: number;
  };
}

export interface PackRagConfig {
  schema_version?: number;
  profile?: string;
  n_predict?: number;
  chat_n_ctx?: number;
  embed_n_ctx?: number;
  context_budget?: number;
  generation?: Partial<RagConfig['generation']>;
  retrieval?: Partial<RagConfig['retrieval']>;
  prompt?: Partial<RagConfig['prompt']>;
  debug?: Partial<RagConfig['debug']>;
}

const DEFAULT_RAG_CONFIG: RagConfig = {
  /** Max tokens the model can generate per answer. Lower = shorter, faster replies. */
  n_predict: 96,
  /** LLM generation parameters (llama.rn completion). */
  generation: {
    temperature: 0,
    top_p: 1,
    top_k: 1,
    penalty_repeat: 1,
  },
  /** Context window size for the chat model (prompt + generation). */
  chat_n_ctx: 1024,
  /** Context window size for the embed model (when using embedding path). */
  embed_n_ctx: 512,
  /** Retrieval (embedding path only): top-k rules and cards to merge. */
  retrieval: {
    top_k_rules: 3,
    top_k_cards: 2,
    top_k_merge: 4,
    rules_weight: 0.6,
    cards_weight: 0.4,
  },
  /** Prompt sizing: hard cap so prompt + generation fits in chat_n_ctx. */
  prompt: {
    max_prompt_chars: 1400,
    default_max_context_chars: 2400,
    chars_per_token_est: 4,
    system_instruction:
      'Answer using only the provided context. Use concise bullet points. Include exactly one quoted sentence from context. If context is insufficient, reply exactly: Insufficient retrieved context.',
  },
  /** Deterministic context provider: max tokens for the context bundle (rules + cards). */
  context_budget: 800,
  /** Debug logging: excerpt length and prompt preview length in logs. */
  debug: {
    excerpt_len: 180,
    prompt_preview_len: 400,
  },
};

/** Mutable runtime config. Pack rag_config.json can override this after load. */
export const RAG_CONFIG: RagConfig = {
  ...DEFAULT_RAG_CONFIG,
  generation: { ...DEFAULT_RAG_CONFIG.generation },
  retrieval: { ...DEFAULT_RAG_CONFIG.retrieval },
  prompt: { ...DEFAULT_RAG_CONFIG.prompt },
  debug: { ...DEFAULT_RAG_CONFIG.debug },
};

function applyNumeric(target: Record<string, number>, key: string, value: unknown): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target[key] = value;
  }
}

function applyString(target: Record<string, string>, key: string, value: unknown): void {
  if (typeof value === 'string' && value.trim()) {
    target[key] = value;
  }
}

/**
 * Apply optional pack override. Invalid/missing keys are ignored.
 * If schema_version is provided and unsupported, no override is applied.
 */
export function applyPackRagConfig(override: PackRagConfig | null | undefined): void {
  if (!override || typeof override !== 'object') return;
  if (override.schema_version != null && override.schema_version !== 1) return;

  applyNumeric(RAG_CONFIG as unknown as Record<string, number>, 'n_predict', override.n_predict);
  applyNumeric(RAG_CONFIG as unknown as Record<string, number>, 'chat_n_ctx', override.chat_n_ctx);
  applyNumeric(RAG_CONFIG as unknown as Record<string, number>, 'embed_n_ctx', override.embed_n_ctx);
  applyNumeric(RAG_CONFIG as unknown as Record<string, number>, 'context_budget', override.context_budget);

  if (override.generation) {
    applyNumeric(RAG_CONFIG.generation as unknown as Record<string, number>, 'temperature', override.generation.temperature);
    applyNumeric(RAG_CONFIG.generation as unknown as Record<string, number>, 'top_p', override.generation.top_p);
    applyNumeric(RAG_CONFIG.generation as unknown as Record<string, number>, 'top_k', override.generation.top_k);
    applyNumeric(RAG_CONFIG.generation as unknown as Record<string, number>, 'penalty_repeat', override.generation.penalty_repeat);
  }
  if (override.retrieval) {
    applyNumeric(RAG_CONFIG.retrieval as unknown as Record<string, number>, 'top_k_rules', override.retrieval.top_k_rules);
    applyNumeric(RAG_CONFIG.retrieval as unknown as Record<string, number>, 'top_k_cards', override.retrieval.top_k_cards);
    applyNumeric(RAG_CONFIG.retrieval as unknown as Record<string, number>, 'top_k_merge', override.retrieval.top_k_merge);
    applyNumeric(RAG_CONFIG.retrieval as unknown as Record<string, number>, 'rules_weight', override.retrieval.rules_weight);
    applyNumeric(RAG_CONFIG.retrieval as unknown as Record<string, number>, 'cards_weight', override.retrieval.cards_weight);
  }
  if (override.prompt) {
    applyNumeric(RAG_CONFIG.prompt as unknown as Record<string, number>, 'max_prompt_chars', override.prompt.max_prompt_chars);
    applyNumeric(RAG_CONFIG.prompt as unknown as Record<string, number>, 'default_max_context_chars', override.prompt.default_max_context_chars);
    applyNumeric(RAG_CONFIG.prompt as unknown as Record<string, number>, 'chars_per_token_est', override.prompt.chars_per_token_est);
    applyString(RAG_CONFIG.prompt as unknown as Record<string, string>, 'system_instruction', override.prompt.system_instruction);
  }
  if (override.debug) {
    applyNumeric(RAG_CONFIG.debug as unknown as Record<string, number>, 'excerpt_len', override.debug.excerpt_len);
    applyNumeric(RAG_CONFIG.debug as unknown as Record<string, number>, 'prompt_preview_len', override.debug.prompt_preview_len);
  }
}
