import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  shortcutsOpen: boolean
  setShortcutsOpen: (v: boolean) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      shortcutsOpen: false,
      setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
    }),
    { name: 'rapidbill:v1:ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
)
