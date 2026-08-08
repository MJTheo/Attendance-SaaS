import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SignIn } from './routes/SignIn'
import { SignUp } from './routes/SignUp'
import { Dashboard } from './routes/Dashboard'
import { Team } from './routes/Team'
import { Analytics } from './routes/Analytics'
import { Calendar } from './routes/Calendar'
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
          <Route path="/accept-invite" element={<AcceptInvite />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
