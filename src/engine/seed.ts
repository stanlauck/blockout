/**
 * Deterministic seed assignment. A shot's export randomness (camera rig
 * noise, ComfyUI sampler seed, metadata) must replay byte-identically on
 * every export, so the seed is picked exactly ONCE when the shot is created,
 * persisted in the project (shot.camera.seed), and reused from storage by
 * every render — never regenerated at export time.
 *
 * The generator deliberately avoids Math.random: seeds come from a monotonic
 * counter offset from a session-stable base, so shots created in sequence get
 * distinct, ordered seeds that are reproducible and traceable to creation
 * order within a session, while still varying between sessions.
 */

const BASE = Date.now() % 1_000_000_000
const STRIDE = 7919 // prime stride so consecutive seeds decorrelate
let counter = 0

/** Next seed for a freshly created shot camera (or a default routine spec). */
export function nextSeed(): number {
  return (BASE + counter++ * STRIDE) % 1_000_000_000
}
