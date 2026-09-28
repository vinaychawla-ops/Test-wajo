import { answerKeyItemSchema, type AnswerKeyItem } from "./types.js";

/**
 * Parses the teacher's answer key textarea.
 * One question per line: question | answer | points | alternatives | tolerance
 * Only the first two fields are required.
 */
export function parseAnswerKey(raw: string): { items: AnswerKeyItem[]; errors: string[] } {
  const items: AnswerKeyItem[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  raw.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const parts = trimmed.split("|").map((p) => p.trim());
    const [question, answer, pointsRaw, alternativesRaw, toleranceRaw] = parts;

    if (!question || !answer) {
      errors.push(`Line ${index + 1}: needs at least "question | answer".`);
      return;
    }
    if (seen.has(question.toLowerCase())) {
      errors.push(`Line ${index + 1}: question "${question}" is listed twice.`);
      return;
    }
    seen.add(question.toLowerCase());

    const points = pointsRaw ? Number(pointsRaw) : 1;
    if (!Number.isFinite(points) || points < 0) {
      errors.push(`Line ${index + 1}: "${pointsRaw}" is not a valid points value.`);
      return;
    }
    const tolerance = toleranceRaw ? Number(toleranceRaw) : 0;
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      errors.push(`Line ${index + 1}: "${toleranceRaw}" is not a valid tolerance.`);
      return;
    }

    const parsed = answerKeyItemSchema.safeParse({
      question,
      answer,
      points,
      tolerance,
      alternatives: (alternativesRaw ?? "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      caseSensitive: false,
    });
    if (!parsed.success) {
      errors.push(`Line ${index + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}.`);
      return;
    }
    items.push(parsed.data);
  });

  if (!items.length && !errors.length) errors.push("The answer key is empty.");
  return { items, errors };
}
