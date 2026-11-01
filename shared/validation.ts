// Input schemas. The API parses every request body with these before it touches the database; the forms use the same
// schemas to show errors inline next to each field.

import { z } from 'zod'
import { isValidIsoDate, daysBetween } from './calendar'
import { normalizeRanges, overlaps, type TimeRange } from './time'
import { GRADE_BANDS } from './types'

// Zod 4 compiles fast validators with `new Function` when it can, and probes for it once. The site's content security
// policy forbids eval, and the probe shows up as a violation in the console, so validation runs without compiling.
z.config({ jitless: true })

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, min <= 1 ? `${label} is required` : `${label} needs at least ${min} characters`)
    .max(max, `${label} can have at most ${max} characters`)

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Not a valid id')

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(120, 'Email can have at most 120 characters')
  .regex(EMAIL, 'Enter an email address like name@example.com')

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export const phoneSchema = z
  .string({ error: 'Phone is required' })
  .trim()
  .refine((v) => /^1?\d{10}$/.test(v.replace(/\D/g, '')), 'Enter a 10 digit phone number')
  .transform(formatPhone)

const weekday = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)], {
  error: 'Choose a weekday',
})

/** Sessions start and end on the quarter hour between 7:00 AM and 8:00 PM and last 30 minutes to 4 hours. */
export const sessionSlotSchema = z
  .object({
    id: idSchema.optional(),
    day: weekday,
    start: z.number().int().min(420, 'Starts at 7:00 AM or later').max(1200),
    end: z.number().int().min(420).max(1200, 'Ends by 8:00 PM'),
  })
  .refine((s) => s.start % 15 === 0 && s.end % 15 === 0, { error: 'Use quarter hours', path: ['start'] })
  .refine((s) => s.end > s.start, { error: 'Ends after it starts', path: ['end'] })
  .refine((s) => s.end - s.start >= 30 && s.end - s.start <= 240, {
    error: 'A session lasts 30 minutes to 4 hours',
    path: ['end'],
  })

export const schoolInputSchema = z
  .object({
    name: text('School name', 2, 80),
    address: z.object({
      street: text('Street', 3, 100),
      city: text('City', 2, 60),
      state: z
        .string({ error: 'State is required' })
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, 'Use the two letter state code'),
      zip: z
        .string({ error: 'ZIP code is required' })
        .trim()
        .regex(/^\d{5}$/, 'Enter a 5 digit ZIP code'),
    }),
    contact: z.object({
      name: text('Contact name', 2, 80),
      title: z.string().trim().max(60, 'Title can have at most 60 characters').default(''),
      email: emailSchema,
      phone: phoneSchema,
    }),
    gradeBands: z
      .array(z.enum(GRADE_BANDS), { error: 'Choose at least one grade level' })
      .min(1, 'Choose at least one grade level')
      .max(3)
      .transform((bands) => GRADE_BANDS.filter((b) => bands.includes(b))),
    sessions: z
      .array(sessionSlotSchema)
      .min(1, 'Add at least one weekly session')
      .max(6, 'A school can have at most 6 weekly sessions'),
  })
  .superRefine((school, ctx) => {
    school.sessions.forEach((a, i) => {
      school.sessions.forEach((b, j) => {
        if (j <= i || a.day !== b.day || !overlaps(a.start, a.end, b.start, b.end)) return
        ctx.addIssue({ code: 'custom', path: ['sessions', j, 'start'], message: 'Overlaps another session that day' })
      })
    })
  })

export type SchoolInput = z.infer<typeof schoolInputSchema>

export const volunteerInputSchema = z.object({
  firstName: text('First name', 1, 40),
  lastName: text('Last name', 1, 40),
  email: emailSchema,
  phone: phoneSchema,
  major: text('Major', 2, 60),
  gradYear: z
    .number({ error: 'Graduation year is required' })
    .int()
    .min(2024, 'Use a year from 2024 to 2035')
    .max(2035, 'Use a year from 2024 to 2035'),
})

export type VolunteerInput = z.infer<typeof volunteerInputSchema>

/** What a volunteer can change about themselves. The email is their sign-in and stays fixed. */
export const profileInputSchema = volunteerInputSchema.omit({ email: true })

export type ProfileInput = z.infer<typeof profileInputSchema>

/** Availability is given in half hours between 8:00 AM and 8:00 PM. */
export const AVAILABILITY_START = 480
export const AVAILABILITY_END = 1200

export const availabilityInputSchema = z.object({
  availability: z
    .array(
      z
        .object({
          day: weekday,
          start: z.number().int().min(AVAILABILITY_START).max(AVAILABILITY_END),
          end: z.number().int().min(AVAILABILITY_START).max(AVAILABILITY_END),
        })
        .refine((r) => r.start % 30 === 0 && r.end % 30 === 0 && r.end > r.start, 'Use half hours'),
    )
    .max(50, 'Too many separate time ranges')
    .transform((ranges) => normalizeRanges(ranges as TimeRange[])),
})

export const semesterInputSchema = z
  .object({
    name: text('Name', 3, 40),
    startDate: z.string().refine(isValidIsoDate, 'Enter a start date'),
    endDate: z.string().refine(isValidIsoDate, 'Enter an end date'),
    minTeamSize: z.number().int().min(1, 'At least 1').max(6, 'At most 6'),
    maxTeamSize: z.number().int().min(1, 'At least 1').max(8, 'At most 8'),
    travelBufferMinutes: z
      .number()
      .int()
      .min(0, 'From 0 to 90 minutes')
      .max(90, 'From 0 to 90 minutes')
      .refine((v) => v % 5 === 0, 'Use steps of 5 minutes'),
  })
  .superRefine((s, ctx) => {
    if (isValidIsoDate(s.startDate) && isValidIsoDate(s.endDate)) {
      const days = daysBetween(s.startDate, s.endDate)
      if (days < 7) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Ends at least a week after it starts' })
      else if (days > 200) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'A semester lasts 200 days at most' })
    }
    if (s.maxTeamSize < s.minTeamSize) {
      ctx.addIssue({ code: 'custom', path: ['maxTeamSize'], message: 'At least the minimum size' })
    }
  })

export type SemesterInput = z.infer<typeof semesterInputSchema>

export const teamInputSchema = z.object({
  semesterId: idSchema,
  schoolId: idSchema,
  sessionId: idSchema,
  memberIds: z.array(idSchema).max(12, 'Too many members'),
  notes: z.string().trim().max(500, 'Notes can have at most 500 characters').default(''),
})

export type TeamInput = z.infer<typeof teamInputSchema>

export const teamUpdateSchema = teamInputSchema.omit({ semesterId: true })

export const roleSchema = z.enum(['coordinator', 'volunteer'], { error: 'Choose coordinator or volunteer' })

export const roleInputSchema = z.object({ role: roleSchema })

export const demoSignInSchema = z.union([
  z.object({ role: roleSchema }),
  z.object({ email: z.string().trim().toLowerCase().max(120), password: z.string().max(200) }),
])

/** Zod issues as { "address.zip": "Enter a 5 digit ZIP code" }, keeping the first message for each field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    if (!(key in out)) out[key] = issue.message
  }
  return out
}

