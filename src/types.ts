import { z } from "zod";

/** One question on the answer key. */
export const answerKeyItemSchema = z.object({
  /** Question label as it appears on the worksheet, e.g. "1", "2b", "Q7". */
  question: z.string().min(1).max(20),
  /** The correct answer. */
  answer: z.string().min(1).max(500),
  /** Other spellings/forms that should also count as correct. */
  alternatives: z.array(z.string().max(500)).default([]),
  /** Points this question is worth. */
  points: z.number().min(0).max(1000).default(1),
  /** Numeric answers within this absolute tolerance still count. */
  tolerance: z.number().min(0).max(1000).default(0),
  /** Case matters (useful for chemistry symbols, code, proper nouns). */
  caseSensitive: z.boolean().default(false),
});
export type AnswerKeyItem = z.infer<typeof answerKeyItemSchema>;

export const assignmentSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  subject: z.string().max(100).default(""),
  instructions: z.string().max(2000).default(""),
  /** How close a scanned answer must be to the key to count. 0.8 is forgiving of OCR slips. */
  fuzzyThreshold: z.number().min(0.5).max(1).default(0.85),
  key: z.array(answerKeyItemSchema).min(1),
  createdAt: z.string(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

export type QuestionResult = {
  question: string;
  expected: string;
  studentAnswer: string;
  pointsEarned: number;
  pointsPossible: number;
  verdict: "correct" | "incorrect" | "close" | "blank";
  /** True when the app is not confident and a teacher should eyeball it. */
  needsReview: boolean;
  note: string;
};

export type Submission = {
  id: string;
  assignmentId: string;
  studentName: string;
  submittedAt: string;
  imageFile: string;
  mimeType: string;
  /** Raw text the vision model read off the photo, kept for teacher audit. */
  transcript: string;
  results: QuestionResult[];
  pointsEarned: number;
  pointsPossible: number;
  percent: number;
  needsReview: boolean;
  /** Set when a teacher overrides the automatic score. */
  override?: { pointsEarned: number; comment: string; at: string };
  gradedBy: "vision" | "mock";
};

export type Db = {
  assignments: Assignment[];
  submissions: Submission[];
};
