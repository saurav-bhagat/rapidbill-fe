import { Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useHotkey } from '@/lib/hotkeys'
import { useUI } from '@/store/ui'
import { Toasts } from '../ui/Toasts'
import { ShortcutsOverlay } from './ShortcutsOverlay'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

function GlobalHotkeys() {
  const navigate = useNavigate()
  const { toggleSidebar, setShortcutsOpen } = useUI()
  useHotkey('alt+h', () => navigate('/'))
  useHotkey('alt+k', () => navigate('/issue/new'))
  useHotkey('alt+r', () => navigate('/issues'))
  useHotkey('alt+i', () => navigate('/inventory'))
  useHotkey('alt+p', () => navigate('/parties'))
  useHotkey('alt+s', () => navigate('/settings'))
  useHotkey('shift+/', () => setShortcutsOpen(true), { allowInInput: false })
  useHotkey('mod+b', () => toggleSidebar())
  return null
}


export function AppShell() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full">
      <a href="#main" className="no-print sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-white">{t('layout.skipToContent')}</a>
      <GlobalHotkeys />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-auto p-5 outline-none">
          <Outlet />
        </main>
      </div>
      <ShortcutsOverlay />
      <Toasts />
    </div>
  )
}
