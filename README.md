# SnapGrade

Photo-based assignment grading. A teacher writes an answer key, shares a link, and students
upload a photo of their finished worksheet. The app reads the answers off the photo and
scores them against the key, flagging anything it is not confident about for the teacher.

TypeScript end to end, Express on the server, server-rendered HTML so there is no build
step for the frontend and it works fine on a school laptop or a phone camera.

## Separate URLs

| Who | URL | Protected by |
| --- | --- | --- |
| Teacher | `/teacher` | passcode (`TEACHER_PASSCODE`) |
| Teacher, one assignment | `/teacher/a/<assignmentId>` | passcode |
| Teacher, one submission | `/teacher/s/<submissionId>` | passcode |
| Student | `/s/<assignmentId>` | unlisted link, no login |
| Student result | `/s/<assignmentId>/result/<submissionId>` | unlisted link |

Students never see the teacher pages, the answer key list, or other students' work.

## Running it

```bash
npm install
cp .env.example .env     # then edit it
npm run dev              # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

Tests for the grading logic:

```bash
npm test
```

## Configuration

| Variable | What it does |
| --- | --- |
| `PORT` | Listen port, defaults to 3000 |
| `TEACHER_PASSCODE` | Guards every teacher page. Change it before you deploy. |
| `VISION_API_KEY` | Key for an OpenAI-compatible vision endpoint. Empty means mock mode. |
| `VISION_BASE_URL` | Defaults to `https://api.openai.com/v1`. Works with Azure, OpenRouter, a local vLLM. |
| `VISION_MODEL` | Defaults to `gpt-4o-mini`. |

**Mock mode:** with no `VISION_API_KEY` the app still runs the whole flow end to end, it
just generates plausible answers instead of reading the photo. Every submission graded that
way is labelled "mock" in the teacher view so nobody mistakes it for a real grade.

## The answer key format

One question per line in the teacher's textarea:

```
question | answer | points | alternatives | tolerance
```

Only the first two fields are required.

```
1 | 42 | 2
2 | Paris | 1 | paris, City of Paris
3 | 3.14 | 1 | | 0.01
4 | photosynthesis | 3
# lines starting with # are ignored
```

## How grading works

`src/grader.ts` is pure and has no network or storage in it, which is why it is easy to test.

1. **Numeric compare first.** `1,000` equals `1000`, `.5` equals `0.50`, and a tolerance of
   `0.01` accepts `3.142` for `3.14`.
2. **Exact compare** after normalising whitespace, smart quotes, trailing punctuation and
   (unless the question is case sensitive) capitalisation. Accepted alternatives count.
3. **Fuzzy compare.** Levenshtein similarity above the assignment's threshold (0.85 by
   default) awards the points but marks the question `close` and the submission
   `needs review`, because that is usually the OCR misreading handwriting.
4. Anything below that is marked wrong. If it was still over 55% similar the submission is
   flagged for review, so a genuinely borderline answer reaches a human.

The teacher can override any score from the submission page, with a comment the student sees.

## A few deliberate choices

- **Teachers get the last word.** The app never silently finalises a grade it is unsure of.
  `needsReview`, the transcript of what was read off the page, the original photo, and a
  one-click override are all on the teacher's submission page.
- **The photo is kept.** Grading a photo is contestable, so the image and the transcript
  stay on file for audit rather than being thrown away after scoring.
- **Student links carry entropy.** Assignment ids are 8 random bytes, base64url, so a link
  is not guessable. They are still unlisted links, not authentication.
- **Storage is a JSON file** under `data/`, which is deliberate for a prototype. See below.

## Before this goes near a real classroom

- Swap the JSON store for Postgres or SQLite. `src/store.ts` is the only file that touches
  persistence, so the change stays in one place.
- Give teachers real accounts instead of one shared passcode, and put students behind a
  school login if submissions need to be attributable rather than self-declared names.
- Move uploads to object storage with a retention policy, and check what your jurisdiction
  requires for storing images of children's work.
- Rate-limit `/s/:id/submit`, it currently accepts unlimited uploads per link.
- Tell students and parents that a model does the first pass. That is usually a policy
  requirement and always the decent thing to do.

## Layout

```
src/
  types.ts      zod schemas and the shared types
  store.ts      JSON persistence, the only file that touches the disk
  parseKey.ts   parses the teacher's answer key textarea
  grader.ts     pure grading logic, unit tested
  vision.ts     reads answers off the photo, with a mock fallback
  views.ts      server-rendered HTML
  server.ts     routes for both the teacher and student URLs
  grader.test.ts
```
