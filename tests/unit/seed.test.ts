/** Deterministic shot seeds: assigned at creation, persisted, replayed identically. */

import { describe, expect, it } from 'vitest'
import { ShotEvaluator } from '@engine/evaluate'
import { createProject, createShot, parseProject, serializeProject } from '@engine/schema'
import { nextSeed } from '@engine/seed'

describe('shot seed assignment', () => {
  it('every created shot carries an integer seed in the storage range', () => {
    const doc = createProject('P')
    const scene = doc.scenes[0]!
    for (const shot of [scene.shots[0]!, createShot(scene, '1B'), createShot(scene, '1C')]) {
      expect(Number.isInteger(shot.camera.seed)).toBe(true)
      expect(shot.camera.seed).toBeGreaterThanOrEqual(0)
      expect(shot.camera.seed).toBeLessThan(1_000_000_000)
    }
  })

  it('seeds from the generator are distinct in sequence', () => {
    const a = nextSeed()
    const b = nextSeed()
    expect(b).not.toBe(a)
  })

  it('the seed survives a save/load round-trip unchanged', () => {
    const doc = createProject('P')
    const seed = doc.scenes[0]!.shots[0]!.camera.seed
    const { doc: restored } = parseProject(serializeProject(doc))
    expect(restored!.scenes[0]!.shots[0]!.camera.seed).toBe(seed)
  })
})

describe('deterministic export replay', () => {
  it('re-evaluating the same shot (as every export pass does) replays identical state', () => {
    const doc = createProject('P')
    const scene = doc.scenes[0]!
    const shot = scene.shots[0]!
    // Handheld at full intensity — the noisiest rig, so the seed really drives it.
    shot.camera.rig = 'handheld'
    shot.camera.rigIntensity = 1
    // Round-trip through save/load: the doc a later session (or the export
    // loop rebuilding its evaluator) would start from.
    const { doc: restored } = parseProject(serializeProject(doc))
    const rScene = restored!.scenes[0]!
    const rShot = rScene.shots[0]!
    const a = new ShotEvaluator(scene, shot).evaluate(2.31)
    const b = new ShotEvaluator(rScene, rShot).evaluate(2.31)
    expect(b.camera).toEqual(a.camera)
    expect(b.entities).toEqual(a.entities)
  })

  it('a different seed produces different handheld noise — the seed drives the render', () => {
    const doc = createProject('P')
    const scene = doc.scenes[0]!
    const shot = scene.shots[0]!
    shot.camera.rig = 'handheld'
    shot.camera.rigIntensity = 1
    const other = createShot(scene, '1B')
    other.camera.rig = 'handheld'
    other.camera.rigIntensity = 1
    scene.shots.push(other)
    expect(other.camera.seed).not.toBe(shot.camera.seed)
    const a = new ShotEvaluator(scene, shot).evaluate(2.31).camera
    const b = new ShotEvaluator(scene, other).evaluate(2.31).camera
    expect(b.pan).not.toBeCloseTo(a.pan, 6)
    expect(b.tilt).not.toBeCloseTo(a.tilt, 6)
  })
})
