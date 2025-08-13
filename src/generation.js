import { randomUUID } from "crypto";
import { getDb } from "./db.js";
import { buildSystemPrompt, buildUserPrompt, buildCompliancePrompt } from "./promptPack.js";
import { runModel } from "./openaiClient.js";
import { getPropertyContext } from "./datasources/index.js";
import { z } from "zod";

const OutputSchema = z.object({
  description_mls: z.string(),
  bullets: z.array(z.string()).min(3),
  social_caption: z.string()
});

export async function generateListing(payload) {
  const db = getDb();
  const jobId = randomUUID();
  const system = buildSystemPrompt();
  const context = await getPropertyContext(payload);
  const user = buildUserPrompt(payload, context);
  const messages = [...system, ...user];

  const main = await runModel(messages, "json_object");
  const parsed = safeParseJSON(main.text);
  const result = OutputSchema.parse(parsed);

  const complianceMessages = buildCompliancePrompt({
    description_mls: result.description_mls,
    bullets: result.bullets,
    social_caption: result.social_caption
  });
  const comp = await runModel(complianceMessages, "json_object");
  const compParsed = safeParseJSON(comp.text);
  const flags = Array.isArray(compParsed?.flags) ? compParsed.flags : [];

  const stmt = db.prepare(`INSERT INTO generation_jobs
    (id, user_email, input_payload, output_payload, flags_json, tokens_prompt, tokens_completion, model, status)
    VALUES (@id, @user_email, @in, @out, @flags, @tp, @tc, @model, 'success')`);
  stmt.run({
    id: jobId,
    user_email: payload?.user?.email || null,
    in: JSON.stringify(payload),
    out: JSON.stringify(result),
    flags: JSON.stringify(flags),
    tp: main.usage?.input_tokens || 0,
    tc: main.usage?.output_tokens || 0,
    model: main.model
  });

  return {
    result,
    flags,
    tokens: {
      prompt: main.usage?.input_tokens || 0,
      completion: main.usage?.output_tokens || 0
    },
    model: main.model
  };
}

function safeParseJSON(text) {
  try { return JSON.parse(text); } catch { return {}; }
}
