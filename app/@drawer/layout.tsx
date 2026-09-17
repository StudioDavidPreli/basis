import type { ReactNode } from 'react'
import { DrawerShell } from '@/components/drawer-shell'

// The drawer slot's layout persists across everything the slot shows: the
// sheet's nothing (default.tsx), and every entity page. Next remounts the
// [id] segment on every param change, so anything that must survive a
// switch from one entity to the next (the open <dialog>, the slid-in panel,
// the scramble's from-text) lives in the shell here, and the page below
// renders only the content.
export default function DrawerLayout({ children }: { children: ReactNode }) {
  return <DrawerShell>{children}</DrawerShell>
}
