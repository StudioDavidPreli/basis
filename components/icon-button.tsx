'use client'

// The one icon button style (the refresh arrow and the sun/moon in the
// header, the close X on the drawer and the provenance dialog): a small
// bordered square in the current ink. Icons are drawn once here or beside
// their only user, 16px, one stroke width.

import type { ButtonHTMLAttributes } from 'react'
import styles from './icon-button.module.css'

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={className ? `${styles.iconButton} ${className}` : styles.iconButton} {...props} />
}

export function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
