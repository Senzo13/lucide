import { Bloom, ChromaticAberration, EffectComposer } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { useMemo } from 'react'

/**
 * Post grade for the crystal layer: bloom + prism split only.
 *
 * No vignette here: this canvas is composited ABOVE the DOM, so a full-screen
 * vignette would veil the wordmark and the HUD underneath it. The page-level
 * `.app-shade` already owns the vignette.
 */
export default function Effects() {
  const offset = useMemo(() => new THREE.Vector2(0.0009, 0.0012), [])

  return (
    <EffectComposer multisampling={0}>
      {/* The threshold sits just under the prism's caustics and safely above
          the white wordmark: only the glass blooms, the letters stay crisp.
          It is deliberately generous — the reference's stone is not a clean
          glass body, it is a hot white mass bleeding through a violet block. */}
      <Bloom intensity={1.15} luminanceThreshold={0.48} luminanceSmoothing={0.3} mipmapBlur radius={0.78} />
      <ChromaticAberration
        offset={offset}
        radialModulation
        modulationOffset={0.42}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}
