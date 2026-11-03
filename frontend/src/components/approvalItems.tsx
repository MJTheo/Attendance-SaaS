import type { Correction, LeaveRequest, ProfileEditRequest, ProfileFields } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import { correctionCard, leaveCard } from '../lib/requests'
import type { PendingItem } from './ApprovalQueue'
import { FieldRows } from './RequestCard'

// What a pending request looks like in an admin's queue — shared by the
// approval pages, Team's Requests tab and the Inbox so a request reads the
// same wherever it's reviewed.

export const PROFILE_FIELD_LABEL: Record<keyof ProfileFields, string> = { name: 'Name', email: 'Email' }

export function changedFields(request: ProfileEditRequest): (keyof ProfileFields)[] {
  return (['name', 'email'] as const).filter((f) => request.new_value[f] !== undefined)
}

function changeTitle(request: ProfileEditRequest): string {
  const fields = Object.keys(request.new_value)
  if (fields.length > 1) return 'Name and email change'
  return fields[0] === 'email' ? 'Email change' : 'Name change'
}

export function leaveItem(r: LeaveRequest, tz: string): PendingItem {
  const card = leaveCard(r, tz)
  return {
    id: r.id,
    who: r.requested_by_name ?? 'Someone',
    meta: `${card.title} · sent ${formatDateTime(r.created_at, tz)}`,
    body: <FieldRows fields={card.fields} />,
    reason: r.reason,
  }
}

export function correctionItem(c: Correction, tz: string): PendingItem {
  const card = correctionCard(c, tz)
  return {
    id: c.id,
    who: c.requested_by_name ?? 'Someone',
    meta: `Correction · ${card.title} · sent ${formatDateTime(c.created_at, tz)}`,
    body: <FieldRows fields={card.fields} />,
    reason: c.reason,
  }
}

export function profileItem(r: ProfileEditRequest, tz: string): PendingItem {
  return {
    id: r.id,
    who: r.user_name ?? 'Someone',
    meta: `${changeTitle(r)} · ${formatDateTime(r.created_at, tz)}`,
    body: (
      <div className="flex flex-col gap-2">
        {changedFields(r).map((f) => (
          <div key={f} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
            <div className="flex flex-col gap-0.5 rounded-xl bg-bg px-3 py-2.5">
              <span className="text-xs text-text-muted">{PROFILE_FIELD_LABEL[f]} now</span>
              <span className="[overflow-wrap:anywhere]">{r.old_value[f] ?? '—'}</span>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hidden text-text-muted sm:block">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <div className="flex flex-col gap-0.5 rounded-xl bg-surface-raised px-3 py-2.5">
              <span className="text-xs text-text-muted">Requested</span>
              <span className="font-semibold [overflow-wrap:anywhere]">{r.new_value[f]}</span>
            </div>
          </div>
        ))}
      </div>
    ),
    reason: r.reason,
  }
}

const rejected = (who: string) => `Rejected. ${who} will see it in their requests.`

export const leaveToast = (item: PendingItem, approved: boolean) =>
  approved ? `Approved. ${item.who}’s leave is now on the calendar.` : rejected(item.who)

export const correctionToast = (item: PendingItem, approved: boolean) =>
  approved ? `Approved. ${item.who}’s record is updated, and the old values are kept in the audit trail.` : rejected(item.who)

export const profileToast = (item: PendingItem, approved: boolean) =>
  approved
    ? `Approved. ${item.who}’s profile is updated (a new email takes effect once they confirm it).`
    : `Rejected. ${item.who} will see it on their profile.`
