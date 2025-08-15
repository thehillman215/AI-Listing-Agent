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
  const email = payload?.user?.email;
  const variations = payload?.variations || 1;
  const selectedTemplate = payload?.template_id;
  
  // Apply template if specified
  if (selectedTemplate && email) {
    const template = db.prepare("SELECT * FROM property_templates WHERE id=? AND (user_email=? OR is_shared=1)").get(selectedTemplate, email);
    if (template) {
      const templateData = JSON.parse(template.template_data || '{}');
      payload = { ...payload, ...templateData };
      // Increment usage count
      db.prepare("UPDATE property_templates SET usage_count = usage_count + 1 WHERE id=?").run(selectedTemplate);
    }
  }
  
  // Get AI learning context for enhanced prompts
  let learningContext = {};
  if (email) {
    const subscription = db.prepare("SELECT * FROM user_subscriptions WHERE user_email=?").get(email);
    if (subscription?.ai_learning_enabled) {
      const feedback = db.prepare(`
        SELECT gf.rating, gf.feedback_text, gj.input_payload, gj.output_payload 
        FROM generation_feedback gf 
        JOIN generation_jobs gj ON gf.generation_job_id = gj.id 
        WHERE gf.user_email = ? AND gf.rating >= 4 
        ORDER BY gf.created_at DESC LIMIT 5
      `).all(email);
      
      if (feedback.length > 0) {
        learningContext = {
          successful_patterns: feedback.map(f => ({
            input: JSON.parse(f.input_payload || '{}'),
            output: JSON.parse(f.output_payload || '{}'),
            rating: f.rating
          }))
        };
      }
    }
  }

  const system = buildSystemPrompt(learningContext);
  const context = await getPropertyContext(payload);
  const user = buildUserPrompt(payload, context);
  
  const results = [];
  const allTokens = { prompt: 0, completion: 0 };
  
  // Generate multiple variations if requested
  for (let i = 0; i < Math.min(variations, 5); i++) {
    const messages = [...system, ...user];
    
    // Add variation instruction for multiple generations
    if (variations > 1) {
      messages.push({
        role: "system",
        content: `Generate variation ${i + 1} of ${variations}. Make each variation distinctly different in tone and emphasis while maintaining accuracy.`
      });
    }
    
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
    
    results.push({ ...result, flags, variation: i + 1 });
    allTokens.prompt += main.usage?.input_tokens || 0;
    allTokens.completion += main.usage?.output_tokens || 0;
  }

  // Store the job (use first variation as primary result)
  const primaryResult = results[0];
  const stmt = db.prepare(`INSERT INTO generation_jobs
    (id, user_email, input_payload, output_payload, flags_json, tokens_prompt, tokens_completion, model, status)
    VALUES (@id, @user_email, @in, @out, @flags, @tp, @tc, @model, 'success')`);
  stmt.run({
    id: jobId,
    user_email: email || null,
    in: JSON.stringify(payload),
    out: JSON.stringify({ primary: primaryResult, variations: results }),
    flags: JSON.stringify(primaryResult.flags),
    tp: allTokens.prompt,
    tc: allTokens.completion,
    model: "gpt-4o"
  });

  return {
    jobId,
    result: primaryResult,
    variations: results,
    flags: primaryResult.flags,
    tokens: allTokens,
    model: "gpt-4o"
  };
}

function safeParseJSON(text) {
  try { return JSON.parse(text); } catch { return {}; }
}
