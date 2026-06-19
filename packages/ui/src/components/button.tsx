import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
}

/**
 * Bauhaus button: hairline border + offset shadow that compresses on press.
 * Variants:
 *   primary   — black on white, red shadow accent
 *   secondary — white on black
 *   danger    — red fill
 *   ghost     — no border, text only
 */
export function Button({
  variant = 'primary',
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`${styles.btn} ${styles[variant]} ${className ?? ''}`}
    >
      {children}
    </button>
  )
}
