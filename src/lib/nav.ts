import { Coins, CreditCard, FilePlus2, FileSpreadsheet, LayoutDashboard, Package, ScrollText, Settings, Users, type LucideIcon } from 'lucide-react'

/** labelKey / titleKey are keys in the `common` namespace. */
export interface NavItem { path: string; labelKey: string; titleKey: string; combo: string; icon: LucideIcon; /** Only for the owner of the business, and only when there is an account (not in browser-only mode). */ ownerOnly?: boolean; /** Worked out on the server: only with an account. */ accountOnly?: boolean }

export const NAV: NavItem[] = [
  { path: '/', labelKey: 'nav.home.label', titleKey: 'nav.home.title', combo: 'alt+h', icon: LayoutDashboard },
  { path: '/issue/new', labelKey: 'nav.newIssue.label', titleKey: 'nav.newIssue.title', combo: 'alt+k', icon: FilePlus2 },
  { path: '/issues', labelKey: 'nav.register.label', titleKey: 'nav.register.title', combo: 'alt+r', icon: ScrollText },
  { path: '/inventory', labelKey: 'nav.inventory.label', titleKey: 'nav.inventory.title', combo: 'alt+i', icon: Package },
  { path: '/parties', labelKey: 'nav.parties.label', titleKey: 'nav.parties.title', combo: 'alt+p', icon: Users },
  { path: '/reports', labelKey: 'nav.reports.label', titleKey: 'nav.reports.title', combo: 'alt+g', icon: FileSpreadsheet, accountOnly: true },
  { path: '/earn', labelKey: 'nav.earn.label', titleKey: 'nav.earn.title', combo: 'alt+e', icon: Coins, ownerOnly: true },
  { path: '/license', labelKey: 'nav.license.label', titleKey: 'nav.license.title', combo: 'alt+l', icon: CreditCard, accountOnly: true },
  { path: '/settings', labelKey: 'nav.settings.label', titleKey: 'nav.settings.title', combo: 'alt+s', icon: Settings },
]
