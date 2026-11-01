import { describe, expect, it } from 'vitest'
import { semesterBoard, validateTeam } from '../../shared/schedule'
import { buildDemoWorkspace } from '../../netlify/lib/seed'

function build(today = '2026-11-01') {
  let n = 0
  return buildDemoWorkspace(today, () => `id${++n}`)
}

describe('demo data', () => {
  it('has a plausible size', () => {
    const ws = build()
    expect(ws.schools).toHaveLength(7)
    expect(ws.volunteers.length).toBeGreaterThanOrEqual(25)
    expect(ws.volunteers.length).toBeLessThanOrEqual(40)
    expect(ws.semesters.map((s) => s.name)).toEqual(['Spring 2026', 'Fall 2026', 'Spring 2027'])
  })

  it('uses only fictional contact details', () => {
    const ws = build()
    const emails = [...ws.volunteers.map((v) => v.email), ...ws.schools.map((s) => s.contact.email)]
    const phones = [...ws.volunteers.map((v) => v.phone), ...ws.schools.map((s) => s.contact.phone)]
    expect(emails.every((e) => e.endsWith('@example.com'))).toBe(true)
    expect(new Set(emails).size).toBe(emails.length)
    expect(phones.every((p) => /^\(\d{3}\) 555-01\d\d$/.test(p))).toBe(true)
  })

  it('builds teams that pass every rule, apart from the gaps it means to show', () => {
    const ws = build()
    for (const semester of ws.semesters) {
      const teams = ws.teams.filter((t) => t.semesterId === semester.id)
      for (const team of teams) {
        const issues = validateTeam(team, { semester, schools: ws.schools, volunteers: ws.volunteers, teams, teamId: team.id })
        const codes = issues.map((i) => i.code)
        // The short Cedar Grove team and the Westbrook volunteer whose availability changed are the intended gaps.
        expect(codes.filter((c) => c !== 'too_few' && c !== 'member_unavailable')).toEqual([])
        if (semester.id !== ws.currentSemesterId) expect(codes).toEqual([])
      }
    }
  })

  it('leaves exactly three gaps for the dashboard this semester', () => {
    const ws = build()
    const semester = ws.semesters.find((s) => s.id === ws.currentSemesterId)!
    const board = semesterBoard({
      semester,
      schools: ws.schools,
      volunteers: ws.volunteers,
      teams: ws.teams.filter((t) => t.semesterId === semester.id),
    })
    const flagged = board.filter((row) => row.flags.length)
    expect(flagged.map((row) => [row.school.name, row.flags.map((f) => f.kind)])).toEqual([
      ['Westbrook High School', ['member_unavailable']],
      ['Maple Hollow Elementary School', ['no_team']],
      ['Cedar Grove Elementary School', ['short']],
    ])
    expect(board.length - flagged.length).toBeGreaterThanOrEqual(10)
  })

  it('puts the demo volunteer on two teams this semester', () => {
    const ws = build()
    const mine = ws.teams.filter((t) => t.semesterId === ws.currentSemesterId && t.memberIds.includes(ws.demoVolunteerId))
    expect(mine).toHaveLength(2)
  })

  it('follows the date it is created on', () => {
    const spring = build('2027-02-15')
    expect(spring.semesters.map((s) => s.name)).toEqual(['Fall 2026', 'Spring 2027', 'Fall 2027'])
  })
})
