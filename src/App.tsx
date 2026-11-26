import { Reports } from './pages/Reports'
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router-dom'
import { ManageBusinesses } from '@/businesses/ManageBusinesses'
import { EarnPage } from './earn/EarnPage'
import { AppShell } from './components/layout/AppShell'
import { LicensePage } from './license/LicensePage'
import { Home } from './pages/Home'
import { Inventory } from './pages/Inventory'
import { Issues } from './pages/Issues'
import { Parties } from './pages/Parties'
import { SettingsPage } from './pages/SettingsPage'
import { StockIssueNew } from './pages/StockIssueNew'

function EditIssue() {
  const { id } = useParams()
  return <StockIssueNew key={id} editId={id} />
}

// Data router (not <BrowserRouter>) so pages can block navigation while a voucher is unsaved.
const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: '/issue/new', element: <StockIssueNew /> },
      { path: '/issue/:id/edit', element: <EditIssue /> },
      { path: '/issues', element: <Issues /> },
      { path: '/inventory', element: <Inventory /> },
      { path: '/parties', element: <Parties /> },
      { path: '/reports', element: <Reports /> },
      { path: '/earn', element: <EarnPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/license', element: <LicensePage /> },
      { path: '/businesses', element: <ManageBusinesses /> },
      { path: '/signup', element: <Navigate to="/" replace /> },
      { path: '/login', element: <Navigate to="/" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' })

export default function App() {
  return <RouterProvider router={router} />
}
