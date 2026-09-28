import type { AnswerKeyItem, Assignment, QuestionResult } from "./types.js";

/* ------------------------------------------------------------------ */
/* Text comparison                                                      */
/* ------------------------------------------------------------------ */

/** Strip the noise handwriting OCR usually adds: punctuation, spacing, units-as-words. */
export function normalize(input: string, caseSensitive = false): string {
  let s = input.trim().replace(/\s+/g, " ");
  if (!caseSensitive) s = s.toLowerCase();
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    prev = curr;
  }
  return prev[b.length]!;
}

/** 1 = identical, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

function asNumber(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "").replace(/^\+/, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Grading one question                                                 */
/* ------------------------------------------------------------------ */

export function gradeOne(
  item: AnswerKeyItem,
  rawStudentAnswer: string,
  fuzzyThreshold: number,
): QuestionResult {
  const studentAnswer = (rawStudentAnswer ?? "").trim();
  const base = {
    question: item.question,
    expected: item.answer,
    studentAnswer,
    pointsPossible: item.points,
  };

  if (!studentAnswer || /^(blank|unanswered|n\/a|-)$/i.test(studentAnswer)) {
    return {
      ...base,
      pointsEarned: 0,
      verdict: "blank",
      needsReview: false,
      note: "No answer found for this question on the photo.",
    };
  }

  const accepted = [item.answer, ...item.alternatives].filter(Boolean);
  const student = normalize(studentAnswer, item.caseSensitive);

  // Numeric comparison first, so 0.50 == .5 and tolerance is honoured.
  const studentNum = asNumber(student);
  if (studentNum !== null) {
    for (const candidate of accepted) {
      const keyNum = asNumber(normalize(candidate, item.caseSensitive));
      if (keyNum === null) continue;
      if (Math.abs(studentNum - keyNum) <= item.tolerance) {
        return {
          ...base,
          pointsEarned: item.points,
          verdict: "correct",
          needsReview: false,
          note: item.tolerance > 0 ? `Within tolerance of ±${item.tolerance}.` : "Exact match.",
        };
      }
    }
  }

  for (const candidate of accepted) {
    if (normalize(candidate, item.caseSensitive) === student) {
      return {
        ...base,
        pointsEarned: item.points,
        verdict: "correct",
        needsReview: false,
        note: candidate === item.answer ? "Exact match." : `Matched accepted alternative "${candidate}".`,
      };
    }
  }

  let best = 0;
  let bestCandidate = item.answer;
  for (const candidate of accepted) {
    const score = similarity(normalize(candidate, item.caseSensitive), student);
    if (score > best) {
      best = score;
      bestCandidate = candidate;
    }
  }

  if (best >= fuzzyThreshold) {
    return {
      ...base,
      pointsEarned: item.points,
      verdict: "close",
      needsReview: true,
      note: `Close to "${bestCandidate}" (${Math.round(best * 100)}% match). Likely a handwriting read, worth a glance.`,
    };
  }

  return {
    ...base,
    pointsEarned: 0,
    verdict: "incorrect",
    needsReview: best >= 0.55,
    note:
      best >= 0.55
        ? `Closest key answer was "${bestCandidate}" (${Math.round(best * 100)}% match).`
        : "Does not match the answer key.",
  };
}

export function gradeAll(
  assignment: Assignment,
  extracted: Record<string, string>,
): { results: QuestionResult[]; pointsEarned: number; pointsPossible: number; percent: number; needsReview: boolean } {
  const results = assignment.key.map((item) =>
    gradeOne(item, extracted[item.question] ?? "", assignment.fuzzyThreshold),
  );
  const pointsEarned = results.reduce((sum, r) => sum + r.pointsEarned, 0);
  const pointsPossible = results.reduce((sum, r) => sum + r.pointsPossible, 0);
  const percent = pointsPossible === 0 ? 0 : Math.round((pointsEarned / pointsPossible) * 1000) / 10;
  return {
    results,
    pointsEarned,
    pointsPossible,
    percent,
    needsReview: results.some((r) => r.needsReview),
  };
}
