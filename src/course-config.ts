import type { CourseMetaInput } from "astro-course-university";
import { z } from "astro/zod";

// The level digits ANU uses: 1000--4000 undergraduate, 6000 and 8000
// postgraduate. Both the code pattern and the level field derive from this.
const LEVELS = [1, 2, 3, 4, 6, 8] as const;
const allowedCode = new RegExp(`^SLOP[${LEVELS.join("")}]\\d{3}$`);

export const slopCourseMetaSchema = z
  .strictObject({
    code: z.string().regex(allowedCode, {
      message: "use SLOP plus a 1000–4000, 6000 or 8000 level code",
    }),
    title: z.string().trim().min(1).max(100),
    session: z.string().trim().min(1).max(40),
    year: z.number().int().min(2026).max(2200),
    level: z.literal(LEVELS),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    description: z.string().trim().min(80).max(300),
    tags: z.array(z.string().trim().min(2).max(24)).min(1).max(3),
  })
  .superRefine((course, ctx) => {
    const codeLevel = Number(course.code.at(4));
    if (course.level !== codeLevel) {
      ctx.addIssue({
        code: "custom",
        path: ["level"],
        message: `must match ${course.code}'s first digit (${codeLevel})`,
      });
    }
    if (course.startDate > course.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "must not be after endDate",
      });
    }
  });

// The single source of truth for the course record. The generated homepage,
// navigation label and /api/index.json all read this object.
// Replace every placeholder value, but keep the shape: the catalogue ingests
// this API contract when the course is published.
//
// The code's last three digits were assigned to this repo when it was
// provisioned, and no other course in the cohort has them. Change the first
// digit to your course's level (and `level` to match); keep the other three.
export const courseMeta = slopCourseMetaSchema.parse({
  code: "SLOP8760",
  title: "Slop Opera: Serialized AI Video Drama",
  session: "Semester 1",
  year: 2027,
  level: 8,
  startDate: "2027-02-22",
  endDate: "2027-05-28",
  // The one piece of prose on this site with nowhere to put a Source line: it
  // is the home page's opening paragraph, its hero lead (index.astro slices the
  // first sentence out of it) and the <meta description> every link preview
  // uses. It used to open on "the fastest-growing form of screen drama on
  // earth" and "machines now do most of the shooting" — a superlative and a
  // production-share statistic, both global, neither sourced, and no room here
  // to source them. So it states what the course holds rather than what the
  // world is doing. The real numbers about the form are not gone: they are in
  // week 10, scoped to China and each carrying the regulator or the report it
  // came from (CLAUDE.md §3).
  description:
    "A studio course in vertical serialized drama, where the machine does the shooting and " +
    "only the technique you add to the rig earns a mark. Twelve weeks take you from an empty " +
    "GPU to one finished pilot episode: one shot, one hook, one episode.",
  tags: ["generative video", "screen production", "serial drama"],
}) satisfies CourseMetaInput;
