/**
 * Token types mirrored from @cys-stift/ui/tokens.
 *
 * Why duplicated: spec §6.2 declares packages/domain as "pure TS, framework-
 * agnostic" — it must not depend on packages/ui. The token sets stay in sync
 * because there's exactly one place to change them (the spec).
 */

export type ColorToken = 'red' | 'yellow' | 'blue' | 'black' | 'white' | 'gray'

export type RegionToken = ColorToken

export type Region = 'capture' | 'inbox' | 'canvas' | 'archive' | 'system'