/**
 * Minimal AI provider router — no SDK dependencies.
 * Supports: anthropic | gateway (Vercel AI Gateway) | openai
 *
 * Each provider gets the same call signature:
 *   askAi({ system, user, maxTokens })
 * → returns { text, model, usage }
 */

const DEFAULT_MODEL = {
  anthropic: "claude-sonnet-4-5",
  gateway: "anthropic/claude-sonnet-4.5",
  openai: "gpt-4o-mini",
};

export async function askAi({ system, user, maxTokens = 4000 }) {
  const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  const model = process.env.AI_MODEL ?? DEFAULT_MODEL[provider] ?? DEFAULT_MODEL.anthropic;

  switch (provider) {
    case "anthropic":
      return callAnthropic({ system, user, model, maxTokens });
    case "gateway":
      return callVercelGateway({ system, user, model, maxTokens });
    case "openai":
      return callOpenAi({ system, user, model, maxTokens });
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}

async function callAnthropic({ system, user, model, maxTokens }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json = await res.json();
  const text = json.content?.map((b) => b.text).join("\n") ?? "";
  return { text, model: json.model ?? model, usage: json.usage };
}

async function callVercelGateway({ system, user, model, maxTokens }) {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY not set");

  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gateway ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, model: json.model ?? model, usage: json.usage };
}

async function callOpenAi({ system, user, model, maxTokens }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, model: json.model ?? model, usage: json.usage };
}
