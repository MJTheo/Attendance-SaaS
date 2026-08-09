import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SignIn } from './routes/SignIn'
import { SignUp } from './routes/SignUp'
import { Dashboard } from './routes/Dashboard'
import { Team } from './routes/Team'
import { Analytics } from './routes/Analytics'
import { Calendar } from './routes/Calendar'
import { LeaveRequests } from './routes/LeaveRequests'
import { CorrectionRequests } from './routes/CorrectionRequests'
import { LeaveApprovals } from './routes/LeaveApprovals'
import { CorrectionApprovals } from './routes/CorrectionApprovals'
import { AcceptInvite } from './routes/AcceptInvite'
import { ProtectedRoute } from './routes/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/team" element={<Team />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/requests" element={<Navigate to="/requests/leave" replace />} />
          <Route path="/requests/leave" element={<LeaveRequests />} />
          <Route path="/requests/corrections" element={<CorrectionRequests />} />
          <Route path="/approvals" element={<Navigate to="/approvals/leave" replace />} />
          <Route path="/approvals/leave" element={<LeaveApprovals />} />
          <Route path="/approvals/corrections" element={<CorrectionApprovals />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
