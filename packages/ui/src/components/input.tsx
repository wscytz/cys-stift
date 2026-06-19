import type { InputHTMLAttributes } from 'react'
import styles from './input.module.css'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

/**
 * Bauhaus input: bottom-underline only, no background frame. Focus turns the
 * underline red. Label sits in mono caps above.
 */
export function Input({ label, id, className, ...rest }: InputProps) {
  const inputId = id ?? rest.name
  return (
    <label className={styles.wrap} htmlFor={inputId}>
      {label && <span className={styles.label}>{label}</span>}
      <input {...rest} id={inputId} className={`${styles.input} ${className ?? ''}`} />
    </label>
  )
}
