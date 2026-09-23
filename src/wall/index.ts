/**
 * The exportable wall.
 *
 * Copy `src/wall/` into a project, import the CSS once, and render
 * `<ScreenWall />` in a box. The module needs `react`, `three` and
 * `@react-three/fiber` and nothing else — no store, no router, no design
 * system, no stylesheet of ours.
 *
 * See `src/wall/README.md` for the drop-in checklist and every prop.
 */
export { default as ScreenWall } from './ScreenWall'
export { default as WallRoom } from './Room'
export { default as Emblem } from './Emblem'
export { createFeed, SCREEN_COLS, SCREEN_ROWS } from './feed'
export { createEnvelope, envelopeCut } from './envelope'
export { createRoom, sampleRoom, ROOMS, ROOM_STEP } from './mood'
export { pointer, ease, useGlobalPointer } from './pointer'

export type { Feed, FeedChannel, FeedOptions, Sprite } from './feed'
export type { Envelope, EnvelopeOptions, Moment } from './envelope'
export type { Room } from './mood'
export type { EmblemProps, EmblemShape } from './Emblem'
export type { RoomDriver, RoomFrame, WallRoomProps } from './Room'
export type { ScreenWallProps } from './ScreenWall'
