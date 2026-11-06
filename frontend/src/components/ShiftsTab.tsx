import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type PersonShift, type SetPersonShift, type Shift, type ShiftTemplate } from '../lib/api'
import { TIME_INPUT } from '../lib/timeInput'
import { LoadError, Skeleton } from './Skeleton'
import { StatusIcon } from './StatusDot'

const ROLE_LABEL = { staff: 'Staff', admin: 'Admin', super_admin: 'Super admin' } as const
const INPUT = 'h-11 rounded-[10px] border border-border bg-bg px-3 text-text outline-none focus:border-text disabled:border-dashed disabled:text-text-muted'
const PRIMARY = 'h-11 rounded-[10px] bg-action px-4 font-semibold text-on-action disabled:opacity-50'
const SECONDARY = 'h-11 rounded-[10px] bg-surface-raised px-4 disabled:opacity-50'

const describe = (shift: Shift | null) => (shift ? `${shift.name} · ${shift.start}–${shift.end}` : 'No shift')

// Team › Shifts (admins and super admins): reusable shift templates, and each
// person's shift — a template, custom times or none. The server judges late
// and early from these at clock-in/out; changing them never rewrites the past.
export function ShiftsTab({ readOnly }: { readOnly: boolean }) {
  const [templates, setTemplates] = useState<ShiftTemplate[] | null>(null)
  const [people, setPeople] = useState<PersonShift[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [t, p] = await Promise.all([api.shiftTemplates(), api.peopleShifts()])
      setTemplates(t)
      setPeople(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shifts')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <LoadError message={error} onRetry={load} />
  if (!templates) return <Skeleton />

  return (
    <div className="flex max-w-[980px] flex-col gap-[18px]">
      <div role="note" className="flex items-start gap-2.5 rounded-xl bg-surface px-4 py-3.5 text-sm leading-normal">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-[3px] flex-none text-text-muted">
          <path d="M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
        </svg>
        <span>
          Clocking in after the start time counts as late, and clocking out before the end as early leave. Shifts apply on
          your working days, and changes count from now on — past records don't change. People with no shift are never
          marked late, early or absent.
        </span>
      </div>
      <Templates templates={templates} readOnly={readOnly} onChanged={load} />
      <People people={people} templates={templates} readOnly={readOnly} onChanged={load} />
    </div>
  )
}

function Templates({ templates, readOnly, onChanged }: { templates: ShiftTemplate[]; readOnly: boolean; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(t: ShiftTemplate) {
    setError(null)
    try {
      await api.deleteShiftTemplate(t.id)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the shift')
    }
  }

  return (
    <section aria-labelledby="templates-heading" className="flex flex-col rounded-[16px] bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2.5 pt-[18px] sm:px-5">
        <div className="flex flex-col gap-0.5">
          <h2 id="templates-heading" className="m-0 text-base font-semibold">
            Shift templates
          </h2>
          <span className="text-[13px] text-text-muted">Reusable shifts you can give to several people.</span>
        </div>
        {!readOnly && editing !== 'new' && (
          <button type="button" onClick={() => setEditing('new')} className={SECONDARY}>
            Add template
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mx-4 mb-2 mt-0 rounded-xl bg-signal-soft px-3.5 py-3 text-sm sm:mx-5">
          {error}
        </p>
      )}
      {editing === 'new' && <TemplateForm onDone={() => setEditing(null)} onSaved={onChanged} />}
      {templates.length === 0 && editing !== 'new' && (
        <div className="border-t border-border px-4 py-5 text-sm text-text-muted sm:px-5">
          No templates yet. Add one, or give people custom times below.
        </div>
      )}
      {templates.map((t) =>
        editing === t.id ? (
          <TemplateForm key={t.id} template={t} onDone={() => setEditing(null)} onSaved={onChanged} />
        ) : (
          <div key={t.id} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 sm:px-5">
            <span className="min-w-0 flex-[1_1_160px] truncate text-sm font-semibold">{t.name}</span>
            <span className="w-28 font-mono text-[13px]">
              {t.start}–{t.end}
            </span>
            <span className="w-24 text-[13px] text-text-muted">{t.people === 1 ? '1 person' : `${t.people} people`}</span>
            {!readOnly && (
              <span className="flex gap-2">
                <button type="button" onClick={() => setEditing(t.id)} className={`${SECONDARY} h-9 max-sm:h-11`}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(t)}
                  disabled={t.people > 0}
                  title={t.people > 0 ? `In use by ${t.people === 1 ? '1 person' : `${t.people} people`} — move them first` : undefined}
                  className={`${SECONDARY} h-9 max-sm:h-11`}
                >
                  Delete
                </button>
              </span>
            )}
          </div>
        ),
      )}
    </section>
  )
}

function TemplateForm({ template, onDone, onSaved }: { template?: ShiftTemplate; onDone: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(template?.name ?? '')
  const [start, setStart] = useState(template?.start ?? '08:00')
  const [end, setEnd] = useState(template?.end ?? '17:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const body = { name, start, end }
      await (template ? api.updateShiftTemplate(template.id, body) : api.createShiftTemplate(body))
      await onSaved()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the shift')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border bg-bg px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-[1_1_180px] flex-col gap-1.5">
          <span className="text-[13px] text-text-muted">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="e.g. Day" className={INPUT} />
        </label>
        <label className="flex w-28 flex-col gap-1.5">
          <span className="text-[13px] text-text-muted">Start</span>
          <input {...TIME_INPUT} value={start} onChange={(e) => setStart(e.target.value)} required className={`${INPUT} font-mono text-sm`} />
        </label>
        <label className="flex w-28 flex-col gap-1.5">
          <span className="text-[13px] text-text-muted">End</span>
          <input {...TIME_INPUT} value={end} onChange={(e) => setEnd(e.target.value)} required className={`${INPUT} font-mono text-sm`} />
        </label>
        <span className="flex gap-2">
          <button type="button" onClick={onDone} className={SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={PRIMARY}>
            {saving ? 'Saving…' : template ? 'Save' : 'Add'}
          </button>
        </span>
      </div>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-error">
          {error}
        </p>
      )}
    </form>
  )
}

function People({ people, templates, readOnly, onChanged }: { people: PersonShift[]; templates: ShiftTemplate[]; readOnly: boolean; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="people-shifts-heading" className="flex flex-col rounded-[16px] bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[18px] sm:px-5">
        <h2 id="people-shifts-heading" className="m-0 text-base font-semibold">
          Each person's shift
        </h2>
        <span className="font-mono text-xs text-text-muted">{people.length} people</span>
      </div>
      {people.map((p) => (
        <PersonRow key={p.user_id} person={p} templates={templates} readOnly={readOnly} onChanged={onChanged} />
      ))}
    </section>
  )
}

function choiceOf(shift: Shift | null): string {
  if (!shift) return 'none'
  return shift.kind === 'custom' ? 'custom' : `t:${shift.template_id}`
}

function PersonRow({ person, templates, readOnly, onChanged }: { person: PersonShift; templates: ShiftTemplate[]; readOnly: boolean; onChanged: () => Promise<void> }) {
  const [choice, setChoice] = useState(choiceOf(person.shift))
  const [start, setStart] = useState(person.shift?.kind === 'custom' ? person.shift.start : '08:00')
  const [end, setEnd] = useState(person.shift?.kind === 'custom' ? person.shift.end : '17:00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = choiceOf(person.shift)
  const dirty =
    choice !== current || (choice === 'custom' && (start !== person.shift?.start || end !== person.shift?.end))

  async function save() {
    setError(null)
    setSaved(false)
    setSaving(true)
    const body: SetPersonShift =
      choice === 'none'
        ? { mode: 'none' }
        : choice === 'custom'
          ? { mode: 'custom', start, end }
          : { mode: 'template', template_id: choice.slice(2) }
    try {
      await api.setPersonShift(person.user_id, body)
      setSaved(true)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the shift')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <span className="flex min-w-0 flex-[1_1_180px] flex-col">
          <span className="truncate text-sm font-medium">{person.name}</span>
          <span className="truncate font-mono text-xs text-text-muted">
            {ROLE_LABEL[person.role]} · {describe(person.shift)}
          </span>
        </span>
        <span className="flex flex-[1_1_100%] flex-wrap items-center gap-2 sm:flex-none">
          <select
            aria-label={`Shift for ${person.name}`}
            value={choice}
            disabled={readOnly}
            onChange={(e) => {
              setSaved(false)
              setChoice(e.target.value)
            }}
            className={`${INPUT} min-w-0 flex-1 px-2.5 text-[13px] sm:w-48 sm:flex-none`}
          >
            <option value="none">No shift</option>
            {templates.map((t) => (
              <option key={t.id} value={`t:${t.id}`}>
                {t.name} ({t.start}–{t.end})
              </option>
            ))}
            <option value="custom">Custom times</option>
          </select>
          {choice === 'custom' && (
            <>
              <input {...TIME_INPUT} aria-label={`Start for ${person.name}`} value={start} disabled={readOnly} onChange={(e) => setStart(e.target.value)} className={`${INPUT} w-[84px] font-mono text-sm`} />
              <span className="text-text-muted">–</span>
              <input {...TIME_INPUT} aria-label={`End for ${person.name}`} value={end} disabled={readOnly} onChange={(e) => setEnd(e.target.value)} className={`${INPUT} w-[84px] font-mono text-sm`} />
            </>
          )}
          {/* Only once something changed, so the list stays quiet. */}
          {!readOnly && (dirty || saving) && (
            <button type="button" onClick={save} disabled={saving} className={`${PRIMARY} max-sm:flex-[1_1_100%]`}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </span>
      </div>
      {saved && !dirty && (
        <p role="status" className="m-0 flex items-center gap-1.5 text-[13px]">
          <StatusIcon status="approved" size={13} />
          Saved. Applies from their next clock-in.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  )
}
