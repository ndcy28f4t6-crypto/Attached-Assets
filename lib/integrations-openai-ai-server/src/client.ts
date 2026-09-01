import OpenAI from "openai";

let openaiInstance: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (openaiInstance) return openaiInstance;

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY must be set to use OpenAI features.");
  }

  openaiInstance = new OpenAI({ apiKey, baseURL });
  return openaiInstance;
}

// Optional proxy object to preserve direct `openai.chat...` syntax across your app
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop: keyof OpenAI) {
    return getOpenAI()[prop];
  },
});
