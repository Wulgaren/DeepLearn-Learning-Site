import Groq from "https://esm.sh/groq-sdk@0.5.0";
import { log } from "./shared.ts";

export const CLASSIFIER_MODEL = "llama-3.1-8b-instant";
export const GROQ_COMPOUND_MODEL = "groq/compound";

const CLASSIFIER_MAX_TOKENS = 10;

/**
 * Returns true if the classifier reply starts with YES (topic needs web grounding).
 */
export async function classifyNeedsWebGrounding(
  groq: InstanceType<typeof Groq>,
  prompt: string
): Promise<boolean> {
  try {
    const completion = await groq.chat.completions.create({
      model: CLASSIFIER_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: CLASSIFIER_MAX_TOKENS,
    });
    const text = (completion.choices[0]?.message?.content ?? "").trim().toUpperCase();
    const useWeb = text.startsWith("YES");
    log("classifier", "info", "needsWebGrounding", {
      model: CLASSIFIER_MODEL,
      response: text.slice(0, 20),
      useWeb,
    });
    return useWeb;
  } catch (err) {
    log("classifier", "warn", "Classification failed, defaulting to no web", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
