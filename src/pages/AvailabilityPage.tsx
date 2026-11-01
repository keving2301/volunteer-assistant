import { useEffect, useMemo, useState } from 'react'
import { localIsoDate, semesterStatus } from '../../shared/calendar'
import { availabilityReason } from '../../shared/schedule'
import { dayName, formatRange, normalizeRanges, type TimeRange } from '../../shared/time'
import { shortSchoolName } from '../../shared/types'
import { errorMessage } from '../api/client'
import { useMe, useMyTeams, useSaveAvailability } from '../api/hooks'
import { AvailabilityDayList, AvailabilityGrid, AvailabilitySummary, useIsPhone, type GridMarker } from '../components/Availability'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { InlineError, LoadError, Loading, Notice, PageHeader } from '../components/ui'

const same = (a: readonly TimeRange[], b: readonly TimeRange[]) =>
  JSON.stringify(normalizeRanges(a)) === JSON.stringify(normalizeRanges(b))

export function AvailabilityPage() {
  const me = useMe()
  const myTeams = useMyTeams()
  const save = useSaveAvailability()
  const toast = useToast()
  const isPhone = useIsPhone()
  const [draft, setDraft] = useState<TimeRange[] | null>(null)
  const [saved, setSaved] = useState<{ teamId: string; message: string }[] | null>(null)
  const today = localIsoDate()

  useEffect(() => {
    if (me.data && draft === null) setDraft(me.data.availability)
  }, [me.data, draft])

  const dirty = Boolean(me.data && draft && !same(draft, me.data.availability))

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const active = useMemo(
    () => (myTeams.data ?? []).filter((t) => semesterStatus(t.semester, today) !== 'past'),
    [myTeams.data, today],
  )
  const markers: GridMarker[] = active
    .filter((t) => semesterStatus(t.semester, today) === 'current')
    .map((t) => ({ day: t.session.day, start: t.session.start, end: t.session.end, label: shortSchoolName(t.school.name) }))
  const uncovered = draft
    ? active.filter((t) => availabilityReason({ availability: draft }, t.session, t.semester.travelBufferMinutes))
    : []

  if (me.isError) return <LoadError message={errorMessage(me.error)} onRetry={() => me.refetch()} />
  if (me.isPending || !draft) return <Loading label="Loading your availability" />

  const showBar = dirty || save.isPending

  const submit = () =>
    save.mutate(draft, {
      onSuccess: (result) => {
        setDraft(result.volunteer.availability)
        setSaved(result.warnings)
        toast('Availability saved')
      },
    })

  return (
    <div className="page page-with-bar">
      <PageHeader
        title="Availability"
        meta="The weekly times you can teach, Monday to Friday. Coordinators place you on a team only when you are free for the whole session plus travel time."
      />

      {saved && saved.length > 0 && !dirty && (
        <Notice tone="warn">
          Saved. These teams are no longer covered by your times and now show on your coordinator's dashboard:
          <ul className="notice-list">
            {saved.map((w) => (
              <li key={w.teamId}>{w.message}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="avail-layout">
        <section className="panel avail-editor" aria-labelledby="editor-title">
          <div className="panel-head">
            <h2 id="editor-title" className="panel-title">
              Your week
            </h2>
            <div className="legend" aria-hidden="true">
              <span className="legend-item">
                <span className="legend-swatch is-free" />
                Free
              </span>
              <span className="legend-item">
                <span className="legend-swatch is-team" />
                Your team
              </span>
            </div>
          </div>
          <p className="panel-text" id="editor-help">
            {isPhone
              ? 'Pick a day, then tap each half hour you are free.'
              : 'Click or drag to mark free time, and again to clear it. With a keyboard, move with the arrow keys and press Space; hold Shift to mark as you move.'}
          </p>
          {isPhone ? (
            <AvailabilityDayList value={draft} onChange={setDraft} markers={markers} />
          ) : (
            <AvailabilityGrid value={draft} onChange={setDraft} markers={markers} label="Your weekly availability" />
          )}
        </section>

        <aside className="panel avail-side" aria-labelledby="summary-title">
          <h2 id="summary-title" className="panel-title">
            Summary
          </h2>
          <AvailabilitySummary value={draft} />
          {uncovered.length > 0 && (
            <div className="avail-warning">
              <Icon name="alert" size={16} />
              <div>
                {uncovered.length === 1 ? 'This leaves a team uncovered:' : 'This leaves teams uncovered:'}
                <ul className="notice-list">
                  {uncovered.map((t) => {
                    const need = { start: t.session.start - t.semester.travelBufferMinutes, end: t.session.end + t.semester.travelBufferMinutes }
                    return (
                      <li key={t.team.id}>
                        {shortSchoolName(t.school.name)}, {dayName(t.session.day)}: needs {formatRange(need.start, need.end)}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Slides in while there are unsaved changes; hidden (and out of the tab order) otherwise. */}
      <div className={showBar ? 'save-bar is-shown' : 'save-bar'} role="region" aria-label="Unsaved changes">
        <div className="save-bar-inner">
          <span className="save-bar-text">{save.isPending ? 'Saving your availability' : 'You have unsaved changes.'}</span>
          {save.isError && <InlineError>{errorMessage(save.error)}</InlineError>}
          <div className="save-bar-actions">
            <button type="button" className="button" onClick={() => setDraft(me.data!.availability)} disabled={save.isPending}>
              Discard
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={submit}
              disabled={save.isPending}
              aria-busy={save.isPending || undefined}
            >
              {save.isPending ? <span className="button-busy">Saving</span> : 'Save availability'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
