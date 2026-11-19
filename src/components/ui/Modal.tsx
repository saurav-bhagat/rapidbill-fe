import type { ComponentProps } from 'react'
import { Overlay } from './Overlay'
export const Modal = (p: Omit<ComponentProps<typeof Overlay>, 'variant'>) => <Overlay {...p} variant="modal" />
export const Drawer = (p: Omit<ComponentProps<typeof Overlay>, 'variant'>) => <Overlay {...p} variant="drawer" />
