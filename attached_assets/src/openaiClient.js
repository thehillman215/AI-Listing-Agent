import OpenAI from "openai";

export const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const MODEL_NAME = process.env.MODEL_NAME || "gpt-5";
export const USE_RESPONSES_API = String(process.env.USE_RESPONSES_API || "true") === "true";

export async function runModel(messages, responseFormat = "json_object") {
  if (USE_RESPONSES_API) {
    try {
      const response = await client.responses.create({
        model: MODEL_NAME,
        messages,
        response_format: { type: responseFormat }
      });
      const text = response.output_text || response.output?.[0]?.content?.[0]?.text || "";
      const usage = response.usage || {};
      return { text, usage, model: response.model || MODEL_NAME };
    } catch (e) {
      console.warn("Responses API failed, falling back to Chat Completions:", e.message);
    }
  }
  const completion = await client.chat.completions.create({
    model: MODEL_NAME,
    messages,
    response_format: { type: responseFormat }
  });
  const text = completion.choices?.[0]?.message?.content || "";
  const usage = completion.usage || {};
  return { text, usage, model: completion.model || MODEL_NAME };
}
