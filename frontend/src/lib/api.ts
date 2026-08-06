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

export interface UserProfile {
  id: string
  org_id: string
  role: 'admin' | 'staff'
  name: string
  email: string
}

export interface AttendanceRecord {
  id: string
  org_id: string
  user_id: string
  clock_in: string
  clock_out: string | null
  status: 'present' | 'late' | 'early_leave' | 'absent'
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

export interface TeamAnalytics {
  users: UserAnalyticsSummary[]
  by_weekday: WeekdayLateRate[]
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

export interface Correction {
  id: string
  attendance_record_id: string
  org_id: string
  requested_by: string
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
  signup: (orgName: string, adminName: string) =>
    apiFetch<UserProfile>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ org_name: orgName, admin_name: adminName }),
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
  teamAttendance: () => apiFetch<TeamAttendanceRecord[]>('/admin/attendance'),
  inviteStaff: (email: string, name: string) =>
    apiFetch<UserProfile>('/admin/invite', {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    }),
  streak: () => apiFetch<StreakResponse>('/attendance/streak'),
  analytics: () => apiFetch<TeamAnalytics>('/admin/analytics'),
  reports: () => apiFetch<Report[]>('/admin/reports'),
}
