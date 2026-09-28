import type { Assignment } from "./types.js";

export type Extraction = {
  answers: Record<string, string>;
  transcript: string;
  source: "vision" | "mock";
};

const SYSTEM_PROMPT = `You are reading a photo of a student's handwritten or printed homework.
Transcribe exactly what the student wrote. Never correct spelling, never solve the problem,
never guess an answer the student did not write. If a question is unanswered, return an empty string.
Reply with JSON only, in the shape:
{"transcript": "<everything legible on the page>", "answers": {"<question label>": "<student answer>"}}`;

/**
 * Reads the student's answers off the photo using any OpenAI-compatible vision endpoint.
 * With no API key configured the app falls back to mock mode so the whole flow still runs.
 */
export async function extractAnswers(
  assignment: Assignment,
  image: Buffer,
  mimeType: string,
): Promise<Extraction> {
  const apiKey = process.env.VISION_API_KEY;
  if (!apiKey) return mockExtraction(assignment);

  const baseUrl = (process.env.VISION_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.VISION_MODEL ?? "gpt-4o-mini";
  const labels = assignment.key.map((k) => k.question);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Assignment: ${assignment.title}. Return an answer for each of these question labels: ${labels.join(", ")}.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${image.toString("base64")}`, detail: "high" },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Vision provider returned ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { transcript?: string; answers?: Record<string, unknown> };

  const answers: Record<string, string> = {};
  for (const label of labels) {
    const value = parsed.answers?.[label];
    answers[label] = typeof value === "string" ? value : value == null ? "" : String(value);
  }
  return { answers, transcript: parsed.transcript ?? "", source: "vision" };
}

/** Deterministic stand-in so the app is demoable without an API key. */
function mockExtraction(assignment: Assignment): Extraction {
  const answers: Record<string, string> = {};
  assignment.key.forEach((item, i) => {
    if (i % 4 === 3) answers[item.question] = "";
    else if (i % 4 === 2) answers[item.question] = `${item.answer} `.toUpperCase();
    else if (i % 4 === 1) answers[item.question] = "not sure";
    else answers[item.question] = item.answer;
  });
  return {
    answers,
    transcript: "[mock mode] No VISION_API_KEY set, so these answers are generated, not read from the photo.",
    source: "mock",
  };
}
