import type { Scope } from './hotkeys'

/**
 * Single source of truth for the shortcuts overlay and SHORTCUTS.md.
 * `phase` = the build phase in which the shortcut becomes live.
 * `description`/`group` stay English: SHORTCUTS.md is generated from them.
 * `alt` lists extra combos that do the same thing.
 */
export interface ShortcutDoc {
  /** Stable key into the `shortcuts` i18n namespace (`desc.<id>`). */
  id: string
  combo: string
  alt?: string[]
  scope: Scope
  group: 'Navigate' | 'Billing' | 'Lists' | 'Dialogs'
  description: string
  phase: number
}

export const SHORTCUTS: ShortcutDoc[] = [
  { id: 'navHome', combo: 'alt+h', scope: 'global', group: 'Navigate', description: 'Home (dashboard)', phase: 6 },
  { id: 'navNew', combo: 'alt+k', scope: 'global', group: 'Navigate', description: 'New Stock Issue', phase: 1 },
  { id: 'navRegister', combo: 'alt+r', scope: 'global', group: 'Navigate', description: 'Stock Issue Register', phase: 1 },
  { id: 'navInventory', combo: 'alt+i', scope: 'global', group: 'Navigate', description: 'Inventory Master', phase: 1 },
  { id: 'navParties', combo: 'alt+p', scope: 'global', group: 'Navigate', description: 'Parties & Departments', phase: 1 },
  { id: 'navReports', combo: 'alt+g', scope: 'global', group: 'Navigate', description: 'GST reports for the accountant', phase: 10 },
  { id: 'navEarn', combo: 'alt+e', scope: 'global', group: 'Navigate', description: 'Earn with RapidBill (referrals)', phase: 9 },
  { id: 'navSettings', combo: 'alt+s', scope: 'global', group: 'Navigate', description: 'Settings', phase: 1 },
  { id: 'switchMenu', combo: 'alt+b', scope: 'global', group: 'Navigate', description: 'Open the business switcher', phase: 7 },
  { id: 'switchNth', combo: 'alt+1', alt: ['alt+2', 'alt+3', 'alt+4', 'alt+5'], scope: 'global', group: 'Navigate', description: 'Open the 1st to 5th business', phase: 7 },
  { id: 'manageBusinesses', combo: 'alt+shift+b', scope: 'global', group: 'Navigate', description: 'Manage businesses', phase: 8 },
  { id: 'showShortcuts', combo: 'shift+/', scope: 'global', group: 'Navigate', description: 'Show this shortcuts list', phase: 1 },
  { id: 'toggleSidebar', combo: 'mod+b', scope: 'global', group: 'Navigate', description: 'Collapse / expand sidebar', phase: 1 },
  { id: 'closeDialog', combo: 'escape', scope: 'modal', group: 'Dialogs', description: 'Close dialog or drawer', phase: 1 },
  { id: 'saveForm', combo: 'mod+enter', scope: 'modal', group: 'Dialogs', description: 'Save form / next step / import', phase: 2 },
  { id: 'printPreview', combo: 'mod+p', scope: 'modal', group: 'Dialogs', description: 'Print / Save as PDF (invoice preview)', phase: 4 },
  { id: 'focusSearch', combo: '/', scope: 'list', group: 'Lists', description: 'Focus search', phase: 2 },
  { id: 'moveRows', combo: 'up', alt: ['down'], scope: 'list', group: 'Lists', description: 'Move through rows (PgUp, PgDn, Home, End too)', phase: 2 },
  { id: 'openRow', combo: 'enter', scope: 'list', group: 'Lists', description: 'Open row: stock movement (Inventory), edit (Parties), view & print (Register)', phase: 2 },
  { id: 'newRecord', combo: 'n', scope: 'list', group: 'Lists', description: 'New item, party or voucher (also from Home)', phase: 2 },
  { id: 'editRow', combo: 'e', scope: 'list', group: 'Lists', description: 'Edit selected row (Inventory, Parties, Register)', phase: 2 },
  { id: 'adjustStock', combo: 'a', scope: 'list', group: 'Lists', description: 'Adjust stock of selected item (Inventory)', phase: 2 },
  { id: 'importInventory', combo: 'i', scope: 'list', group: 'Lists', description: 'Import inventory from a file (Inventory)', phase: 5 },
  { id: 'receivePayment', combo: 'r', scope: 'list', group: 'Lists', description: 'Receive a payment from the selected party (Parties)', phase: 6 },
  { id: 'partyStatement', combo: 's', scope: 'list', group: 'Lists', description: 'Statement of the selected party (Parties)', phase: 6 },
  { id: 'deleteParty', combo: 'delete', scope: 'list', group: 'Lists', description: 'Delete selected party (Parties)', phase: 2 },
  { id: 'printVoucher', combo: 'p', scope: 'list', group: 'Lists', description: 'View / print selected voucher (Register)', phase: 4 },
  { id: 'cancelVoucher', combo: 'c', scope: 'list', group: 'Lists', description: 'Cancel selected voucher (Register)', phase: 4 },
  { id: 'returnItems', combo: 't', scope: 'list', group: 'Lists', description: 'Return items from the selected voucher: a credit note (Register)', phase: 6 },
  { id: 'duplicateVoucher', combo: 'mod+d', scope: 'list', group: 'Lists', description: 'Duplicate selected voucher (Register)', phase: 4 },
  { id: 'saveSettings', combo: 'mod+s', scope: 'list', group: 'Lists', description: 'Save settings (Settings)', phase: 5 },
  { id: 'billEnter', combo: 'enter', scope: 'billing', group: 'Billing', description: 'Select item, then Qty → Rate → Disc → next row', phase: 3 },
  { id: 'billMove', combo: 'up', alt: ['down'], scope: 'billing', group: 'Billing', description: 'Same column, previous / next row (in the item picker: move highlight)', phase: 3 },
  { id: 'quickAdd', combo: 'f2', scope: 'billing', group: 'Billing', description: 'Quick-add a new item (also works inside the item picker)', phase: 3 },
  { id: 'clearItem', combo: 'backspace', scope: 'billing', group: 'Billing', description: 'On a chosen item cell: clear it and pick a different item', phase: 3 },
  { id: 'removeLine', combo: 'delete', alt: ['alt+delete'], scope: 'billing', group: 'Billing', description: 'Remove line (Delete on a chosen item cell, Alt+Delete from any cell of the row)', phase: 3 },
  { id: 'billDiscount', combo: 'f4', scope: 'billing', group: 'Billing', description: 'Jump to bill discount (5% or an amount)', phase: 3 },
  { id: 'savePreview', combo: 'mod+s', alt: ['f10', 'mod+w'], scope: 'billing', group: 'Billing', description: 'Save & preview print (Ctrl+W is best effort, see browser limits)', phase: 3 },
  { id: 'saveNext', combo: 'mod+enter', scope: 'billing', group: 'Billing', description: 'Save & start next voucher', phase: 3 },
  { id: 'billEscape', combo: 'escape', scope: 'billing', group: 'Billing', description: 'Close an open picker, otherwise discard voucher (asks first)', phase: 3 },
]

/** Phase whose features are live right now. Bump as phases ship. */
export const CURRENT_PHASE = 8
