import type { Assignment, QuestionResult, Submission } from "./types.js";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
:root { --ink:#16202b; --muted:#5b6b7c; --line:#dfe6ee; --bg:#f5f7fa; --ok:#127c4a; --bad:#b3261e; --warn:#8a5a00; --accent:#1e5fbf; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
header { background:#fff; border-bottom:1px solid var(--line); padding:14px 20px; display:flex; gap:14px; align-items:baseline; }
header a { color:var(--accent); text-decoration:none; font-size:14px; }
header strong { font-size:17px; }
main { max-width:860px; margin:0 auto; padding:24px 20px 64px; }
h1 { font-size:24px; margin:0 0 6px; }
h2 { font-size:18px; margin:28px 0 10px; }
p.sub { color:var(--muted); margin:0 0 20px; }
.card { background:#fff; border:1px solid var(--line); border-radius:10px; padding:18px; margin-bottom:16px; }
label { display:block; font-weight:600; font-size:14px; margin:14px 0 5px; }
input[type=text], input[type=number], input[type=password], textarea, select {
  width:100%; padding:9px 11px; border:1px solid var(--line); border-radius:7px; font:inherit; background:#fff; }
textarea { min-height:110px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:14px; }
button { background:var(--accent); color:#fff; border:0; border-radius:7px; padding:10px 18px; font:inherit; font-weight:600; cursor:pointer; }
button.secondary { background:#fff; color:var(--accent); border:1px solid var(--accent); }
table { width:100%; border-collapse:collapse; font-size:15px; }
th, td { text-align:left; padding:9px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
th { font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
.pill { display:inline-block; padding:2px 9px; border-radius:99px; font-size:12px; font-weight:700; }
.correct { background:#e3f5ea; color:var(--ok); }
.incorrect { background:#fde8e6; color:var(--bad); }
.close { background:#fdf0d5; color:var(--warn); }
.blank { background:#eceff3; color:var(--muted); }
.score { font-size:40px; font-weight:700; margin:0; }
.muted { color:var(--muted); font-size:14px; }
.link-box { background:#eef3fb; border:1px dashed var(--accent); border-radius:8px; padding:12px; word-break:break-all; font-family:ui-monospace,monospace; font-size:14px; }
.flash { background:#fdf0d5; border:1px solid #e8cf9a; border-radius:8px; padding:12px; margin-bottom:16px; }
.error { background:#fde8e6; border:1px solid #f2bfba; color:var(--bad); }
img.photo { max-width:100%; border-radius:8px; border:1px solid var(--line); }
.row { display:flex; gap:16px; flex-wrap:wrap; }
.row > * { flex:1 1 220px; }
`;

export function page(title: string, body: string, nav = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · SnapGrade</title><style>${STYLE}</style></head>
<body><header><strong>SnapGrade</strong>${nav}</header><main>${body}</main></body></html>`;
}

export const teacherNav = `<a href="/teacher">Assignments</a><a href="/teacher/new">New assignment</a><a href="/teacher/logout">Sign out</a>`;

/* ---------------------------------------------------------------- */

export function landingPage(): string {
  return page(
    "Welcome",
    `<h1>SnapGrade</h1>
     <p class="sub">Students photograph their finished work. It gets graded against the teacher's answer key.</p>
     <div class="row">
       <div class="card"><h2 style="margin-top:0">Teachers</h2>
         <p class="muted">Write an answer key, share a link, review every submission.</p>
         <p><a href="/teacher"><button>Teacher sign in</button></a></p></div>
       <div class="card"><h2 style="margin-top:0">Students</h2>
         <p class="muted">Open the link your teacher gave you, then upload a photo of your work.</p>
         <p class="muted">Student links look like <code>/s/&lt;code&gt;</code>.</p></div>
     </div>`,
  );
}

export function teacherLoginPage(error?: string): string {
  return page(
    "Teacher sign in",
    `<h1>Teacher sign in</h1>
     ${error ? `<div class="flash error">${esc(error)}</div>` : ""}
     <form class="card" method="post" action="/teacher/login">
       <label for="passcode">Passcode</label>
       <input id="passcode" name="passcode" type="password" autofocus required>
       <p style="margin-top:16px"><button type="submit">Sign in</button></p>
     </form>`,
  );
}

export function assignmentListPage(assignments: Assignment[], counts: Record<string, number>): string {
  const rows = assignments.length
    ? assignments
        .map(
          (a) => `<tr>
            <td><a href="/teacher/a/${esc(a.id)}">${esc(a.title)}</a><div class="muted">${esc(a.subject || "No subject")}</div></td>
            <td>${a.key.length}</td>
            <td>${counts[a.id] ?? 0}</td>
            <td class="muted">${esc(new Date(a.createdAt).toLocaleDateString())}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">No assignments yet.</td></tr>`;
  return page(
    "Assignments",
    `<h1>Your assignments</h1>
     <p class="sub">Each one gets its own student link.</p>
     <div class="card"><table>
       <tr><th>Assignment</th><th>Questions</th><th>Submissions</th><th>Created</th></tr>${rows}
     </table></div>
     <p><a href="/teacher/new"><button>New assignment</button></a></p>`,
    teacherNav,
  );
}

export function newAssignmentPage(error?: string, previous?: Record<string, string>): string {
  const v = (field: string) => esc(previous?.[field] ?? "");
  return page(
    "New assignment",
    `<h1>New assignment</h1>
     <p class="sub">One question per line: <code>question | answer | points | alternatives | tolerance</code>. Only the first two are required.</p>
     ${error ? `<div class="flash error">${esc(error)}</div>` : ""}
     <form class="card" method="post" action="/teacher/assignments">
       <label for="title">Title</label>
       <input id="title" name="title" type="text" required value="${v("title")}" placeholder="Fractions quiz 3">
       <label for="subject">Subject</label>
       <input id="subject" name="subject" type="text" value="${v("subject")}" placeholder="Year 6 maths">
       <label for="instructions">Instructions for students</label>
       <input id="instructions" name="instructions" type="text" value="${v("instructions")}" placeholder="Photograph the whole page, keep it flat and well lit.">
       <label for="key">Answer key</label>
       <textarea id="key" name="key" required placeholder="1 | 42
2 | Paris | 2 | paris, City of Paris
3 | 3.14 | 1 | | 0.01
4 | photosynthesis | 3">${v("key")}</textarea>
       <label for="fuzzy">Handwriting leniency</label>
       <select id="fuzzy" name="fuzzy">
         <option value="0.95">Strict (0.95) - spelling counts</option>
         <option value="0.85" selected>Balanced (0.85) - forgives OCR slips</option>
         <option value="0.75">Lenient (0.75) - marks generously</option>
       </select>
       <p style="margin-top:18px"><button type="submit">Create assignment</button></p>
     </form>`,
    teacherNav,
  );
}

export function assignmentDetailPage(
  assignment: Assignment,
  submissions: Submission[],
  studentUrl: string,
): string {
  const rows = submissions.length
    ? submissions
        .map((s) => {
          const earned = s.override?.pointsEarned ?? s.pointsEarned;
          const pct = s.pointsPossible ? Math.round((earned / s.pointsPossible) * 1000) / 10 : 0;
          return `<tr>
            <td><a href="/teacher/s/${esc(s.id)}">${esc(s.studentName)}</a>
              ${s.override ? `<span class="pill close">overridden</span>` : ""}
              ${s.needsReview && !s.override ? `<span class="pill close">needs review</span>` : ""}
              ${s.gradedBy === "mock" ? `<span class="pill blank">mock</span>` : ""}</td>
            <td>${earned} / ${s.pointsPossible}</td>
            <td>${pct}%</td>
            <td class="muted">${esc(new Date(s.submittedAt).toLocaleString())}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="4" class="muted">No submissions yet.</td></tr>`;

  const keyRows = assignment.key
    .map(
      (k) => `<tr><td>${esc(k.question)}</td><td>${esc(k.answer)}</td>
        <td class="muted">${esc(k.alternatives.join(", ") || "-")}</td>
        <td>${k.points}</td><td>${k.tolerance || "-"}</td></tr>`,
    )
    .join("");

  return page(
    assignment.title,
    `<h1>${esc(assignment.title)}</h1>
     <p class="sub">${esc(assignment.subject || "No subject")} · ${assignment.key.length} questions</p>
     <div class="card">
       <h2 style="margin-top:0">Student link</h2>
       <p class="muted">Anyone with this link can submit. It does not need the teacher passcode.</p>
       <div class="link-box">${esc(studentUrl)}</div>
     </div>
     <div class="card"><h2 style="margin-top:0">Submissions</h2>
       <table><tr><th>Student</th><th>Score</th><th>Percent</th><th>Submitted</th></tr>${rows}</table>
       <p style="margin:14px 0 0"><a class="muted" href="/teacher/a/${esc(assignment.id)}/export.csv">Download CSV</a></p>
     </div>
     <div class="card"><h2 style="margin-top:0">Answer key</h2>
       <table><tr><th>Q</th><th>Answer</th><th>Also accepted</th><th>Points</th><th>± tolerance</th></tr>${keyRows}</table>
     </div>`,
    teacherNav,
  );
}

function verdictPill(r: QuestionResult): string {
  const label = { correct: "correct", incorrect: "incorrect", close: "close", blank: "blank" }[r.verdict];
  return `<span class="pill ${r.verdict}">${label}</span>`;
}

function resultRows(results: QuestionResult[]): string {
  return results
    .map(
      (r) => `<tr>
        <td>${esc(r.question)}</td>
        <td>${esc(r.studentAnswer) || '<span class="muted">-</span>'}</td>
        <td class="muted">${esc(r.expected)}</td>
        <td>${verdictPill(r)}</td>
        <td>${r.pointsEarned} / ${r.pointsPossible}</td>
        <td class="muted">${esc(r.note)}</td>
      </tr>`,
    )
    .join("");
}

export function teacherSubmissionPage(assignment: Assignment, s: Submission): string {
  const earned = s.override?.pointsEarned ?? s.pointsEarned;
  return page(
    `${s.studentName} · ${assignment.title}`,
    `<h1>${esc(s.studentName)}</h1>
     <p class="sub"><a href="/teacher/a/${esc(assignment.id)}">${esc(assignment.title)}</a> · submitted ${esc(new Date(s.submittedAt).toLocaleString())}</p>
     ${s.gradedBy === "mock" ? `<div class="flash">Graded in mock mode: no vision API key is configured, so these answers were not read from the photo.</div>` : ""}
     <div class="card"><p class="muted" style="margin:0">Score</p><p class="score">${earned} / ${s.pointsPossible}</p>
       ${s.override ? `<p class="muted">Teacher override. Comment: ${esc(s.override.comment) || "none"}</p>` : ""}</div>
     <div class="card"><h2 style="margin-top:0">Question by question</h2>
       <table><tr><th>Q</th><th>Student wrote</th><th>Key</th><th></th><th>Points</th><th>Note</th></tr>${resultRows(s.results)}</table></div>
     <div class="card"><h2 style="margin-top:0">Override the score</h2>
       <form method="post" action="/teacher/s/${esc(s.id)}/override">
         <label for="points">Points earned (out of ${s.pointsPossible})</label>
         <input id="points" name="points" type="number" step="0.5" min="0" max="${s.pointsPossible}" value="${earned}" required>
         <label for="comment">Comment for the student</label>
         <input id="comment" name="comment" type="text" value="${esc(s.override?.comment ?? "")}">
         <p style="margin-top:16px"><button type="submit">Save override</button></p>
       </form></div>
     <div class="card"><h2 style="margin-top:0">Submitted photo</h2>
       <img class="photo" src="/teacher/s/${esc(s.id)}/photo" alt="Student submission">
       <h2>What was read off the page</h2>
       <p class="muted" style="white-space:pre-wrap">${esc(s.transcript) || "No transcript."}</p></div>`,
    teacherNav,
  );
}

export function studentSubmitPage(assignment: Assignment, error?: string): string {
  return page(
    assignment.title,
    `<h1>${esc(assignment.title)}</h1>
     <p class="sub">${esc(assignment.subject || "")}</p>
     ${error ? `<div class="flash error">${esc(error)}</div>` : ""}
     ${assignment.instructions ? `<div class="flash">${esc(assignment.instructions)}</div>` : ""}
     <form class="card" method="post" action="/s/${esc(assignment.id)}/submit" enctype="multipart/form-data">
       <label for="studentName">Your name</label>
       <input id="studentName" name="studentName" type="text" required autocomplete="name">
       <label for="photo">Photo of your completed work</label>
       <input id="photo" name="photo" type="file" accept="image/*" capture="environment" required>
       <p class="muted">JPEG, PNG, WebP or HEIC, up to 12 MB. Lay the page flat and keep the whole sheet in frame.</p>
       <p style="margin-top:16px"><button type="submit">Submit for grading</button></p>
     </form>`,
  );
}

export function studentResultPage(assignment: Assignment, s: Submission): string {
  const earned = s.override?.pointsEarned ?? s.pointsEarned;
  const pct = s.pointsPossible ? Math.round((earned / s.pointsPossible) * 1000) / 10 : 0;
  return page(
    `Result · ${assignment.title}`,
    `<h1>${esc(assignment.title)}</h1>
     <p class="sub">${esc(s.studentName)}</p>
     <div class="card"><p class="muted" style="margin:0">Your score</p>
       <p class="score">${earned} / ${s.pointsPossible}</p><p class="muted">${pct}%</p>
       ${s.needsReview && !s.override ? `<p class="muted">Some answers were hard to read, so your teacher will check them.</p>` : ""}
       ${s.override ? `<p class="muted">Teacher note: ${esc(s.override.comment) || "score adjusted"}</p>` : ""}</div>
     <div class="card"><h2 style="margin-top:0">Question by question</h2>
       <table><tr><th>Q</th><th>You wrote</th><th>Answer</th><th></th><th>Points</th><th>Note</th></tr>${resultRows(s.results)}</table></div>
     <p><a class="muted" href="/s/${esc(assignment.id)}">Submit another photo</a></p>`,
  );
}

export function notFoundPage(message: string): string {
  return page("Not found", `<h1>Not found</h1><p class="sub">${esc(message)}</p><p><a href="/">Back to the start</a></p>`);
}
