import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Assignment, Db, Submission } from "./types.js";

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "db.json");
export const UPLOAD_DIR = join(DATA_DIR, "uploads");

function ensureDirs(): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

function read(): Db {
  ensureDirs();
  if (!existsSync(DB_PATH)) return { assignments: [], submissions: [] };
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf8")) as Db;
  } catch {
    return { assignments: [], submissions: [] };
  }
}

function write(db: Db): void {
  ensureDirs();
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

/** Short, URL-safe, hard to guess. Student links are unlisted, so they need the entropy. */
export function newId(bytes = 8): string {
  return randomBytes(bytes).toString("base64url");
}

export const store = {
  listAssignments(): Assignment[] {
    return read().assignments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getAssignment(id: string): Assignment | undefined {
    return read().assignments.find((a) => a.id === id);
  },

  saveAssignment(assignment: Assignment): Assignment {
    const db = read();
    const i = db.assignments.findIndex((a) => a.id === assignment.id);
    if (i >= 0) db.assignments[i] = assignment;
    else db.assignments.push(assignment);
    write(db);
    return assignment;
  },

  deleteAssignment(id: string): void {
    const db = read();
    db.assignments = db.assignments.filter((a) => a.id !== id);
    db.submissions = db.submissions.filter((s) => s.assignmentId !== id);
    write(db);
  },

  listSubmissions(assignmentId: string): Submission[] {
    return read()
      .submissions.filter((s) => s.assignmentId === assignmentId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },

  getSubmission(id: string): Submission | undefined {
    return read().submissions.find((s) => s.id === id);
  },

  saveSubmission(submission: Submission): Submission {
    const db = read();
    const i = db.submissions.findIndex((s) => s.id === submission.id);
    if (i >= 0) db.submissions[i] = submission;
    else db.submissions.push(submission);
    write(db);
    return submission;
  },
};
