import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { store, newId, UPLOAD_DIR } from "./store.js";
import { parseAnswerKey } from "./parseKey.js";
import { gradeAll } from "./grader.js";
import { extractAnswers } from "./vision.js";
import type { Assignment, Submission } from "./types.js";
import {
  landingPage,
  teacherLoginPage,
  assignmentListPage,
  newAssignmentPage,
  assignmentDetailPage,
  teacherSubmissionPage,
  studentSubmitPage,
  studentResultPage,
  notFoundPage,
} from "./views.js";

const PORT = Number(process.env.PORT ?? 3000);
const TEACHER_PASSCODE = process.env.TEACHER_PASSCODE ?? "change-me";
const COOKIE = "sg_teacher";
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const app = express();
app.use(express.urlencoded({ extended: false }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

/* ---------------------------------------------------------------- */
/* Teacher auth: a signed cookie, no user table to maintain.          */
/* ---------------------------------------------------------------- */

function sign(value: string): string {
  return createHmac("sha256", TEACHER_PASSCODE).update(value).digest("base64url");
}

function isSignedIn(req: Request): boolean {
  const raw = req.headers.cookie ?? "";
  const match = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return false;
  const token = decodeURIComponent(match.slice(COOKIE.length + 1));
  const expected = sign("teacher");
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireTeacher(req: Request, res: Response, next: NextFunction): void {
  if (isSignedIn(req)) {
    next();
    return;
  }
  res.status(401).send(teacherLoginPage());
}

/* ---------------------------------------------------------------- */
/* Public                                                             */
/* ---------------------------------------------------------------- */

app.get("/", (_req, res) => res.send(landingPage()));
app.get("/healthz", (_req, res) => res.json({ ok: true }));

/* ---------------------------------------------------------------- */
/* Teacher                                                            */
/* ---------------------------------------------------------------- */

app.get("/teacher", (req, res) => {
  if (!isSignedIn(req)) {
    res.send(teacherLoginPage());
    return;
  }
  const assignments = store.listAssignments();
  const counts: Record<string, number> = {};
  for (const a of assignments) counts[a.id] = store.listSubmissions(a.id).length;
  res.send(assignmentListPage(assignments, counts));
});

app.post("/teacher/login", (req, res) => {
  const passcode = String(req.body.passcode ?? "");
  if (passcode !== TEACHER_PASSCODE) {
    res.status(401).send(teacherLoginPage("That passcode did not match."));
    return;
  }
  res.setHeader(
    "set-cookie",
    `${COOKIE}=${encodeURIComponent(sign("teacher"))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`,
  );
  res.redirect("/teacher");
});

app.get("/teacher/logout", (_req, res) => {
  res.setHeader("set-cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.redirect("/");
});

app.get("/teacher/new", requireTeacher, (_req, res) => res.send(newAssignmentPage()));

app.post("/teacher/assignments", requireTeacher, (req, res) => {
  const title = String(req.body.title ?? "").trim();
  const subject = String(req.body.subject ?? "").trim();
  const instructions = String(req.body.instructions ?? "").trim();
  const rawKey = String(req.body.key ?? "");
  const fuzzyThreshold = Number(req.body.fuzzy ?? 0.85);

  const { items, errors } = parseAnswerKey(rawKey);
  if (!title) errors.unshift("The assignment needs a title.");
  if (errors.length) {
    res.status(400).send(newAssignmentPage(errors.join(" "), { title, subject, instructions, key: rawKey }));
    return;
  }

  const assignment: Assignment = {
    id: newId(),
    title,
    subject,
    instructions,
    fuzzyThreshold: Number.isFinite(fuzzyThreshold) ? fuzzyThreshold : 0.85,
    key: items,
    createdAt: new Date().toISOString(),
  };
  store.saveAssignment(assignment);
  res.redirect(`/teacher/a/${assignment.id}`);
});

app.get("/teacher/a/:id", requireTeacher, (req, res) => {
  const assignment = store.getAssignment(String(req.params.id));
  if (!assignment) {
    res.status(404).send(notFoundPage("No assignment with that id."));
    return;
  }
  const studentUrl = `${req.protocol}://${req.get("host")}/s/${assignment.id}`;
  res.send(assignmentDetailPage(assignment, store.listSubmissions(assignment.id), studentUrl));
});

app.get("/teacher/a/:id/export.csv", requireTeacher, (req, res) => {
  const assignment = store.getAssignment(String(req.params.id));
  if (!assignment) {
    res.status(404).send(notFoundPage("No assignment with that id."));
    return;
  }
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = [
    "Student",
    "Submitted",
    "Points",
    "Possible",
    "Percent",
    "Needs review",
    ...assignment.key.map((k) => `Q${k.question}`),
  ];
  const lines = [header.map(cell).join(",")];
  for (const s of store.listSubmissions(assignment.id)) {
    const earned = s.override?.pointsEarned ?? s.pointsEarned;
    const pct = s.pointsPossible ? Math.round((earned / s.pointsPossible) * 1000) / 10 : 0;
    lines.push(
      [
        s.studentName,
        s.submittedAt,
        earned,
        s.pointsPossible,
        pct,
        s.needsReview ? "yes" : "no",
        ...assignment.key.map((k) => s.results.find((r) => r.question === k.question)?.studentAnswer ?? ""),
      ]
        .map(cell)
        .join(","),
    );
  }
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader(
    "content-disposition",
    `attachment; filename="${assignment.title.replace(/[^a-z0-9]+/gi, "-")}.csv"`,
  );
  res.send(lines.join("\n"));
});

app.get("/teacher/s/:id", requireTeacher, (req, res) => {
  const submission = store.getSubmission(String(req.params.id));
  if (!submission) {
    res.status(404).send(notFoundPage("No submission with that id."));
    return;
  }
  const assignment = store.getAssignment(submission.assignmentId);
  if (!assignment) {
    res.status(404).send(notFoundPage("That assignment was deleted."));
    return;
  }
  res.send(teacherSubmissionPage(assignment, submission));
});

app.get("/teacher/s/:id/photo", requireTeacher, (req, res) => {
  const submission = store.getSubmission(String(req.params.id));
  if (!submission) {
    res.status(404).end();
    return;
  }
  const path = join(UPLOAD_DIR, submission.imageFile);
  if (!existsSync(path)) {
    res.status(404).end();
    return;
  }
  res.setHeader("content-type", submission.mimeType);
  res.send(readFileSync(path));
});

app.post("/teacher/s/:id/override", requireTeacher, (req, res) => {
  const submission = store.getSubmission(String(req.params.id));
  if (!submission) {
    res.status(404).send(notFoundPage("No submission with that id."));
    return;
  }
  const points = Number(req.body.points);
  if (!Number.isFinite(points) || points < 0 || points > submission.pointsPossible) {
    res.status(400).send(notFoundPage("That score is outside the range for this assignment."));
    return;
  }
  submission.override = {
    pointsEarned: points,
    comment: String(req.body.comment ?? "").trim(),
    at: new Date().toISOString(),
  };
  store.saveSubmission(submission);
  res.redirect(`/teacher/s/${submission.id}`);
});

/* ---------------------------------------------------------------- */
/* Student                                                            */
/* ---------------------------------------------------------------- */

app.get("/s/:id", (req, res) => {
  const assignment = store.getAssignment(String(req.params.id));
  if (!assignment) {
    res.status(404).send(notFoundPage("That assignment link is not valid. Check it with your teacher."));
    return;
  }
  res.send(studentSubmitPage(assignment));
});

app.post("/s/:id/submit", upload.single("photo"), async (req, res) => {
  const assignment = store.getAssignment(String(req.params.id));
  if (!assignment) {
    res.status(404).send(notFoundPage("That assignment link is not valid."));
    return;
  }

  const studentName = String(req.body.studentName ?? "").trim();
  if (!studentName) {
    res.status(400).send(studentSubmitPage(assignment, "Please put your name in."));
    return;
  }
  if (!req.file) {
    res.status(400).send(studentSubmitPage(assignment, "Please attach a photo of your work."));
    return;
  }

  try {
    const extraction = await extractAnswers(assignment, req.file.buffer, req.file.mimetype);
    const graded = gradeAll(assignment, extraction.answers);

    const id = newId();
    const imageFile = `${id}${extname(req.file.originalname) || ".jpg"}`;
    writeFileSync(join(UPLOAD_DIR, imageFile), req.file.buffer);

    const submission: Submission = {
      id,
      assignmentId: assignment.id,
      studentName,
      submittedAt: new Date().toISOString(),
      imageFile,
      mimeType: req.file.mimetype,
      transcript: extraction.transcript,
      gradedBy: extraction.source,
      ...graded,
    };
    store.saveSubmission(submission);
    res.redirect(`/s/${assignment.id}/result/${submission.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Grading failed.";
    res.status(502).send(studentSubmitPage(assignment, `Could not grade that photo: ${message}`));
  }
});

app.get("/s/:id/result/:submissionId", (req, res) => {
  const assignment = store.getAssignment(String(req.params.id));
  const submission = store.getSubmission(String(req.params.submissionId));
  if (!assignment || !submission || submission.assignmentId !== assignment.id) {
    res.status(404).send(notFoundPage("That result is not available."));
    return;
  }
  res.send(studentResultPage(assignment, submission));
});

/* ---------------------------------------------------------------- */

app.use((req, res) => res.status(404).send(notFoundPage(`Nothing lives at ${req.path}.`)));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  res.status(500).send(notFoundPage(message));
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`SnapGrade on http://localhost:${PORT}`);
    console.log(`  teacher: http://localhost:${PORT}/teacher`);
    console.log(`  student: http://localhost:${PORT}/s/<assignment-id>`);
    if (!process.env.VISION_API_KEY) console.log("  note: no VISION_API_KEY set, grading runs in mock mode");
  });
}

export default app;
