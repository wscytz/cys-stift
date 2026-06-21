// Ambient declaration for CSS Modules imports (used by every component in
// this package). Without this, `import styles from './x.module.css'` fails
// tsc --noEmit (the package's lint gate) even though the build works.
// Review fix (v0.37.0) — unblocks the `pnpm -r lint` gate.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}
