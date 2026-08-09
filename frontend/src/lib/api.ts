import { supabase } from './supabase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new ApiError(401, 'Not signed in')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(response.status, body?.detail ?? response.statusText)
  }

  return response.json() as Promise<T>
}

export type Role = 'staff' | 'admin' | 'super_admin'

export interface UserProfile {
  id: string
  org_id: string
  role: Role
  name: string
  email: string
}

// super_admin is a superset of admin — everywhere an 'admin' check gates a
// view or action, a super admin should pass too.
export function isAdmin(profile: Pick<UserProfile, 'role'>): boolean {
  return profile.role === 'admin' || profile.role === 'super_admin'
}

export interface AttendanceRecord {
  id: string
  org_id: string
  user_id: string
  clock_in: string
  clock_out: string | null
  status: 'present' | 'late' | 'early_leave' | 'absent' | 'missed_clockout'
  notes: string | null
}

export interface TeamAttendanceRecord extends AttendanceRecord {
  user_name: string
}

export interface CorrectionFields {
  clock_in?: string
  clock_out?: string
  status?: AttendanceRecord['status']
  notes?: string
}

export interface StreakResponse {
  current_streak: number
}

export interface UserAnalyticsSummary {
  user_id: string
  name: string
  present: number
  late: number
  early_leave: number
  absent: number
  total: number
  late_rate: number
}

export interface WeekdayLateRate {
  weekday: string
  total: number
  late: number
  late_rate: number
}

export type LeaveStatusKey = 'sick_leave' | 'annual_leave'
export type CalendarStatus = AttendanceRecord['status'] | LeaveStatusKey

export interface StatusDistribution {
  present: number
  late: number
  early_leave: number
  absent: number
  sick_leave: number
  annual_leave: number
}

export interface DayStatusCounts extends StatusDistribution {
  date: string
}

export interface CalendarDay {
  date: string
  status: CalendarStatus | null
}

export interface DayDetail {
  date: string
  status: CalendarStatus | null
  clock_in: string | null
  clock_out: string | null
  notes: string | null
  leave_type: 'sick' | 'annual' | null
  leave_reason: string | null
}

export interface TeamDayDetail extends DayDetail {
  user_id: string
  name: string
}

export interface TeamAnalytics {
  users: UserAnalyticsSummary[]
  by_weekday: WeekdayLateRate[]
  distribution: StatusDistribution
  trend: DayStatusCounts[]
}

export interface LeaveRequest {
  id: string
  org_id: string
  user_id: string
  leave_type: 'sick' | 'annual'
  start_date: string
  end_date: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requested_by: string
  requested_by_name: string | null
  approved_by: string | null
  created_at: string
  resolved_at: string | null
}

export interface Report {
  id: string
  org_id: string
  type: string
  generated_at: string
  payload: {
    period_start: string
    period_end: string
    org_totals: { present: number; late: number; early_leave: number; absent: number; total_records: number }
    users: UserAnalyticsSummary[]
  }
}

// Monday=0..Sunday=6, matching the backend's date.weekday() convention.
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface OrgSettings {
  working_days: Weekday[]
  timezone: string
}

export interface Correction {
  id: string
  attendance_record_id: string
  org_id: string
  requested_by: string
  requested_by_name: string | null
  approved_by: string | null
  reason: string
  old_value: CorrectionFields
  new_value: CorrectionFields
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  resolved_at: string | null
}

// All status/streak/pattern computation happens server-side (architecture
// rule 3) — this client only fetches and renders what the API returns.
export const api = {
  signup: (orgName: string, adminName: string, accessCode: string) =>
    apiFetch<UserProfile>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ org_name: orgName, admin_name: adminName, access_code: accessCode }),
    }),
  me: () => apiFetch<UserProfile>('/auth/me'),
  clockIn: () => apiFetch<AttendanceRecord>('/attendance/clock-in', { method: 'POST' }),
  clockOut: (notes?: string) =>
    apiFetch<AttendanceRecord>('/attendance/clock-out', {
      method: 'PATCH',
      body: JSON.stringify({ notes: notes ?? null }),
    }),
  history: () => apiFetch<AttendanceRecord[]>('/attendance/me'),
  requestCorrection: (attendanceRecordId: string, reason: string, newValue: CorrectionFields) =>
    apiFetch<Correction>('/corrections', {
      method: 'POST',
      body: JSON.stringify({ attendance_record_id: attendanceRecordId, reason, new_value: newValue }),
    }),
  corrections: () => apiFetch<Correction[]>('/corrections'),
  approveCorrection: (id: string) => apiFetch<Correction>(`/corrections/${id}/approve`, { method: 'PATCH' }),
  rejectCorrection: (id: string) => apiFetch<Correction>(`/corrections/${id}/reject`, { method: 'PATCH' }),
  teamAttendance: (period?: { start: string; end: string }) =>
    apiFetch<TeamAttendanceRecord[]>(
      period ? `/admin/attendance?start=${period.start}&end=${period.end}` : '/admin/attendance'
    ),
  inviteStaff: (email: string, name: string) =>
    apiFetch<UserProfile>('/admin/invite', {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    }),
  streak: () => apiFetch<StreakResponse>('/attendance/streak'),
  analytics: () => apiFetch<TeamAnalytics>('/admin/analytics'),
  reports: () => apiFetch<Report[]>('/admin/reports'),
  orgSettings: () => apiFetch<OrgSettings>('/admin/settings'),
  updateOrgSettings: (patch: { working_days?: Weekday[]; timezone?: string }) =>
    apiFetch<OrgSettings>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  requestLeave: (leaveType: 'sick' | 'annual', startDate: string, endDate: string, reason: string) =>
    apiFetch<LeaveRequest>('/leave', {
      method: 'POST',
      body: JSON.stringify({ leave_type: leaveType, start_date: startDate, end_date: endDate, reason }),
    }),
  leaveRequests: () => apiFetch<LeaveRequest[]>('/leave'),
  approveLeave: (id: string) => apiFetch<LeaveRequest>(`/leave/${id}/approve`, { method: 'PATCH' }),
  rejectLeave: (id: string) => apiFetch<LeaveRequest>(`/leave/${id}/reject`, { method: 'PATCH' }),
  myCalendar: (year: number, month: number) =>
    apiFetch<CalendarDay[]>(`/attendance/calendar?year=${year}&month=${month}`),
  teamCalendar: (year: number, month: number) =>
    apiFetch<DayStatusCounts[]>(`/admin/calendar?year=${year}&month=${month}`),
  teamMemberCalendar: (userId: string, year: number, month: number) =>
    apiFetch<CalendarDay[]>(`/admin/calendar/${userId}?year=${year}&month=${month}`),
  teamMembers: () => apiFetch<UserProfile[]>('/admin/users'),
  updateUserRole: (userId: string, role: Role) =>
    apiFetch<UserProfile>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  myDay: (isoDate: string) => apiFetch<DayDetail>(`/attendance/day/${isoDate}`),
  myToday: () => apiFetch<DayDetail>('/attendance/today'),
  teamDay: (isoDate: string) => apiFetch<TeamDayDetail[]>(`/admin/day/${isoDate}`),
}
