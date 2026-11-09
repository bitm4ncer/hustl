export type BuildVariant = 'standalone' | 'client'

export interface BuildVariantInput {
  /** `hustlVariant` aus dem gepackten package.json. */
  pkgVariant?: string
  /** `HUSTL_VARIANT` aus der Umgebung (Dev und Tests). */
  envVariant?: string
  isPackaged: boolean
}

export function resolveBuildVariant(input: BuildVariantInput): BuildVariant {
  if (!input.isPackaged && (input.envVariant === 'standalone' || input.envVariant === 'client')) {
    return input.envVariant
  }
  if (input.pkgVariant === 'standalone') return 'standalone'
  return 'client'
}

export function updateChannel(variant: BuildVariant): 'latest' | 'standalone' {
  return variant === 'standalone' ? 'standalone' : 'latest'
}
