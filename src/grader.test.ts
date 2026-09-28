import assert from "node:assert/strict";
import { gradeAll, gradeOne, normalize, similarity } from "./grader.js";
import { parseAnswerKey } from "./parseKey.js";
import { answerKeyItemSchema, type Assignment } from "./types.js";

const item = (over: Partial<Record<string, unknown>>) =>
  answerKeyItemSchema.parse({ question: "1", answer: "Paris", ...over });

// normalisation
assert.equal(normalize("  Paris. "), "paris");
assert.equal(normalize("NaCl", true), "NaCl");
assert.ok(similarity("photosynthesis", "photosynthesis") === 1);

// exact and alternative matches
assert.equal(gradeOne(item({}), "paris", 0.85).verdict, "correct");
assert.equal(gradeOne(item({ alternatives: ["City of Paris"] }), "city of paris", 0.85).verdict, "correct");

// numeric tolerance
assert.equal(gradeOne(item({ answer: "3.14", tolerance: 0.01 }), "3.142", 0.85).verdict, "correct");
assert.equal(gradeOne(item({ answer: "3.14", tolerance: 0 }), "3.2", 0.85).verdict, "incorrect");
assert.equal(gradeOne(item({ answer: "1000" }), "1,000", 0.85).verdict, "correct");

// handwriting slip flagged rather than silently marked wrong
const close = gradeOne(item({ answer: "photosynthesis" }), "photosynthesls", 0.85);
assert.equal(close.verdict, "close");
assert.equal(close.needsReview, true);

// blank
assert.equal(gradeOne(item({}), "", 0.85).verdict, "blank");

// case sensitivity: wrong capitalisation is wrong when the teacher asked for it
assert.equal(gradeOne(item({ answer: "NaCl", caseSensitive: true }), "nacl", 0.85).verdict, "incorrect");
assert.equal(gradeOne(item({ answer: "NaCl", caseSensitive: true }), "NaCl", 0.85).verdict, "correct");
assert.equal(gradeOne(item({ answer: "NaCl" }), "nacl", 0.85).verdict, "correct");

// key parsing
const parsed = parseAnswerKey(`1 | 42 | 2
2 | Paris | 1 | paris, City of Paris
3 | 3.14 | 1 | | 0.01
# a comment line
`);
assert.equal(parsed.errors.length, 0);
assert.equal(parsed.items.length, 3);
assert.equal(parsed.items[1]!.alternatives.length, 2);
assert.equal(parsed.items[2]!.tolerance, 0.01);
assert.ok(parseAnswerKey("1 | 42\n1 | 43").errors[0]!.includes("twice"));

// whole-assignment scoring
const assignment: Assignment = {
  id: "test",
  title: "Test",
  subject: "",
  instructions: "",
  fuzzyThreshold: 0.85,
  key: parsed.items,
  createdAt: new Date().toISOString(),
};
const graded = gradeAll(assignment, { "1": "42", "2": "Paris", "3": "" });
assert.equal(graded.pointsPossible, 4);
assert.equal(graded.pointsEarned, 3);
assert.equal(graded.percent, 75);

console.log("all grader tests passed");
