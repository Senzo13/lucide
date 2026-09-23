/**
 * The room's colour drift lives in the exportable wall module: the site and
 * anything built on top of it have to relight the same room, or the two would
 * stop agreeing on the colour of the same frame.
 */
export { ROOMS, ROOM_STEP, createRoom, sampleRoom, type Room } from '../wall/mood'
