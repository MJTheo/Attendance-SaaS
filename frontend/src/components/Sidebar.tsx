import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isAdmin, type Me, type Notifications } from '../lib/api'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '../lib/theme'

// 24×24 stroke icons, from the design's navigation icon set.
const ICON = {
  dash: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  cal: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  leave: 'M3 8h18v12H3zM8 8V5h8v3',
  corr: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  ana: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  co: 'M4 21V3h10v18M14 9h6v12M8 7h2M8 11h2M8 15h2M2 21h20',
  inbox: 'M3 13l3-9h12l3 9v7H3zM3 13h5l1 3h6l1-3h5',
}

const ROLE_LABEL: Record<Me['role'], string> = { staff: 'Staff', admin: 'Admin', super_admin: 'Super admin' }

function Icon({ d, size = 18, strokeWidth = 1.8 }: { d: string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d} />
    </svg>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function itemClass(active: boolean): string {
  return `flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-left transition-colors sm:min-h-10 ${
    active ? 'bg-surface-raised font-semibold text-text' : 'text-text-muted hover:bg-surface-raised/60 hover:text-text'
  }`
}

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handle(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onOutside])
  return ref
}

// Where the Inbox button goes until there's a real Inbox page: the first
// approval queue with something waiting, or (for staff) the dashboard
// history, where a missed clock-out's correction is filed.
function inboxTarget(me: Me, n: Notifications | null): string {
  if (!isAdmin(me)) return '/'
  if (!n || n.leave_approvals > 0) return '/approvals/leave'
  if (n.correction_approvals > 0) return '/approvals/corrections'
  if (n.profile_changes > 0) return '/team?tab=requests'
  return '/approvals/leave'
}

// Labelled theme switch at the foot of the desktop sidebar.
function ThemeButton() {
  const { theme, toggle, icon } = useTheme()
  return (
    <button type="button" onClick={toggle} className="flex min-h-[42px] w-full items-center gap-2.5 rounded-[10px] bg-surface px-3 text-[13px] text-text-muted hover:text-text">
      <Icon d={icon} size={16} />
      <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
    </button>
  )
}

function OrgBrand({ orgName }: { orgName: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <Brand />
      <div className="truncate text-xs text-text-muted">{orgName}</div>
    </div>
  )
}

function ProfileMenu({ me, onNavigate }: { me: Me; onNavigate: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false))
  const active = useLocation().pathname === '/profile'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profile menu"
        className={`flex min-h-[52px] w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${active ? 'bg-surface-raised' : 'bg-surface'}`}
      >
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-action text-xs font-semibold text-on-action">
          {initials(me.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{me.name}</span>
          <span className="text-xs text-text-muted">{ROLE_LABEL[me.role]}</span>
        </span>
        <span className="text-text-muted">
          <Icon d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} size={16} strokeWidth={2} />
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 top-[58px] z-20 flex flex-col rounded-xl bg-menu p-1.5 shadow-[var(--shadow-menu)]">
          <NavLink
            to="/profile"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onNavigate()
            }}
            className="flex min-h-10 items-center rounded-[9px] px-3 hover:bg-surface-raised"
          >
            My profile
          </NavLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => supabase.auth.signOut()}
            className="flex min-h-10 items-center rounded-[9px] px-3 text-left hover:bg-surface-raised"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function InboxButton({ me, notifications, onNavigate }: { me: Me; notifications: Notifications | null; onNavigate: () => void }) {
  const count = notifications?.total ?? 0
  return (
    <Link
      to={inboxTarget(me, notifications)}
      onClick={onNavigate}
      className="flex min-h-[42px] items-center gap-2.5 rounded-[10px] bg-signal-soft px-3 text-text"
    >
      <Icon d={ICON.inbox} />
      <span className="flex-1 font-semibold">Inbox</span>
      {count > 0 && (
        <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-signal px-[7px] font-mono text-[11px] font-semibold text-on-signal">
          {count}
        </span>
      )}
    </Link>
  )
}

// Leave/Corrections combine "my requests" and "approvals" for admins (there
// are two places to go), so they open a small inline menu with the queue's
// count; staff only ever have one place to go and get a plain link.
function NavGroupMenu({
  label,
  icon,
  requestPath,
  approvalPath,
  pending,
  onNavigate,
}: {
  label: string
  icon: string
  requestPath: string
  approvalPath: string
  pending: number
  onNavigate: () => void
}) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false))
  const active = pathname.startsWith(requestPath) || pathname.startsWith(approvalPath)
  const sub = (path: string) =>
    `flex min-h-11 items-center justify-between rounded-[9px] px-3 text-text hover:bg-surface-raised sm:min-h-10 ${pathname === path ? 'bg-surface-raised font-semibold' : ''}`
  return (
    <div ref={ref} className="flex flex-col gap-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={itemClass(active)}>
        <Icon d={icon} />
        <span className="flex-1">{label}</span>
        <span className="text-text-muted">
          <Icon d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={14} strokeWidth={2} />
        </span>
      </button>
      {open && (
        <div role="menu" className="ml-3 flex flex-col rounded-xl bg-menu p-1.5 shadow-[var(--shadow-menu)]">
          <NavLink to={requestPath} role="menuitem" className={sub(requestPath)} onClick={() => { setOpen(false); onNavigate() }}>
            My requests
          </NavLink>
          <NavLink to={approvalPath} role="menuitem" className={sub(approvalPath)} onClick={() => { setOpen(false); onNavigate() }}>
            Approvals
            {pending > 0 && <span className="font-mono text-xs text-text-muted">{pending}</span>}
          </NavLink>
        </div>
      )}
    </div>
  )
}

function NavItems({ me, notifications, onNavigate }: { me: Me; notifications: Notifications | null; onNavigate: () => void }) {
  const admin = isAdmin(me)
  const link = (to: string, label: string, icon: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => itemClass(isActive)} onClick={onNavigate}>
      <Icon d={icon} />
      <span className="flex-1">{label}</span>
    </NavLink>
  )
  return (
    <nav aria-label="Main" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <div className="px-3 pb-1 text-[11px] font-semibold text-text-muted">You</div>
        {link('/', 'Dashboard', ICON.dash, true)}
        {link('/calendar', 'Calendar', ICON.cal)}
        {admin ? (
          <NavGroupMenu label="Leave" icon={ICON.leave} requestPath="/requests/leave" approvalPath="/approvals/leave" pending={notifications?.leave_approvals ?? 0} onNavigate={onNavigate} />
        ) : (
          link('/requests/leave', 'Leave', ICON.leave)
        )}
        {admin ? (
          <NavGroupMenu label="Corrections" icon={ICON.corr} requestPath="/requests/corrections" approvalPath="/approvals/corrections" pending={notifications?.correction_approvals ?? 0} onNavigate={onNavigate} />
        ) : (
          link('/requests/corrections', 'Corrections', ICON.corr)
        )}
      </div>
      {admin && (
        <div className="flex flex-col gap-0.5">
          <div className="px-3 pb-1 text-[11px] font-semibold text-text-muted">Manage</div>
          {link('/team', 'Team', ICON.team)}
          {link('/analytics', 'Analytics', ICON.ana)}
          {link('/company', 'Company', ICON.co)}
        </div>
      )}
    </nav>
  )
}

export function Sidebar({ me, notifications }: { me: Me; notifications: Notifications | null }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const close = () => setDrawerOpen(false)
  const count = notifications?.total ?? 0

  return (
    <>
      {/* Mobile: 58px top bar; the sidebar becomes a slide-in drawer. */}
      <header className="flex h-[58px] items-center gap-1 bg-sidebar px-2 sm:hidden">
        <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu" aria-expanded={drawerOpen} className="flex h-11 w-11 items-center justify-center rounded-[10px]">
          <Icon d="M4 7h16M4 12h16M4 17h16" size={22} strokeWidth={2} />
        </button>
        <Brand className="flex-1 !text-base" />
        <Link to={inboxTarget(me, notifications)} aria-label={`Inbox, ${count} waiting`} className="relative flex h-11 w-11 items-center justify-center">
          <Icon d={ICON.inbox} size={21} />
          {count > 0 && (
            <span className="absolute right-[5px] top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-signal px-1 font-mono text-[10px] font-semibold text-on-signal">
              {count}
            </span>
          )}
        </Link>
        <ThemeToggle />
      </header>

      {drawerOpen && <button type="button" aria-label="Close navigation menu" onClick={close} className="fixed inset-0 z-40 bg-overlay sm:hidden" />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-3.5 overflow-y-auto bg-sidebar px-3 py-3.5 transition-transform duration-200 sm:sticky sm:top-0 sm:z-auto sm:h-screen sm:w-60 sm:shrink-0 sm:translate-x-0 sm:gap-4 sm:px-3.5 sm:py-[18px] sm:shadow-none sm:transition-none ${
          // The shadow only while open: off-screen it would still bleed into view.
          drawerOpen ? 'translate-x-0 shadow-[var(--shadow-menu)]' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-1.5">
          <div className="min-w-0 flex-1">
            <OrgBrand orgName={me.org_name} />
          </div>
          <button type="button" onClick={close} aria-label="Close navigation menu" className="flex h-11 w-11 items-center justify-center rounded-[10px] text-text-muted sm:hidden">
            <Icon d="M6 6l12 12M18 6L6 18" strokeWidth={2} />
          </button>
        </div>
        <ProfileMenu me={me} onNavigate={close} />
        <InboxButton me={me} notifications={notifications} onNavigate={close} />
        <NavItems me={me} notifications={notifications} onNavigate={close} />
        <div className="mt-auto hidden sm:block">
          <ThemeButton />
        </div>
      </aside>
    </>
  )
}
