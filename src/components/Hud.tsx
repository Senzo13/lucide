import ViewGizmo from './ViewGizmo'
import './Hud.css'

/**
 * The right-hand instrument panel of the reference. It reads the live
 * orientation of the 3D view and it belongs to the permanent chrome: the world
 * keeps diving behind it, the read-out keeps running.
 */
export default function Hud() {
  return (
    <aside className="hud" aria-label="Vue 3D temps réel">
      <ViewGizmo />
    </aside>
  )
}
