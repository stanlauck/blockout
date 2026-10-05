/**
 * Control-server e2e for the project lifecycle actions: launch the built app
 * and drive new_project / open_project over the localhost control server the
 * same way the MCP bridge (mcp/blockout-mcp.mjs) would — the full agent loop
 * with no manual New Project step.
 */

import { _electron as electron, test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let app: ElectronApplication
let page: Page
let smokeDir: string
let port: number
let token: string

/** POST a control action the same way the MCP bridge does. */
async function rpc<T>(action: string, params: Record<string, unknown> = {}): Promise<{ ok: boolean; data?: T; error?: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, params })
  })
  expect(res.status).toBe(200)
  return (await res.json()) as { ok: boolean; data?: T; error?: string }
}

test.beforeAll(async () => {
  smokeDir = mkdtempSync(join(tmpdir(), 'blockout-projects-'))

  app = await electron.launch({
    args: ['out/main/index.js'],
    // BLOCKOUT_CONFIG_DIR pins the control-server discovery file to the test
    // dir instead of the platform config dir (~/.config vs %APPDATA%).
    env: {
      ...process.env,
      BLOCKOUT_SMOKE_DIR: smokeDir,
      BLOCKOUT_CONFIG_DIR: join(smokeDir, 'config')
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const discoveryFile = join(smokeDir, 'config', 'control.json')
  expect(existsSync(discoveryFile)).toBe(true)
  ;({ port, token } = JSON.parse(readFileSync(discoveryFile, 'utf-8')) as { port: number; token: string })
})

test.afterAll(async () => {
  await app?.close()
})

test('new_project creates and opens a project without touching the UI', async () => {
  const folder = join(smokeDir, 'Agent.blockout')
  const body = await rpc<{ ok: boolean; project_path: string; project_name: string }>('new_project', {
    folder,
    name: 'Agent Project'
  })
  expect(body.ok, `new_project failed: ${body.error ?? ''}`).toBe(true)
  expect(body.data!.project_path).toBe(folder)
  expect(body.data!.project_name).toBe('Agent Project')
  // project.json is on disk and valid.
  const doc = JSON.parse(readFileSync(join(folder, 'project.json'), 'utf-8'))
  expect(doc.version).toBe(1)
  expect(doc.name).toBe('Agent Project')

  // get_state now reports the new project with its fresh scene + shot.
  const state = await rpc<{ project: string; scene: { name: string } | null; shot: { name: string } | null }>('get_state')
  expect(state.ok).toBe(true)
  expect(state.data!.project).toBe('Agent Project')
  expect(state.data!.scene?.name).toBe('Scene 1')
  expect(state.data!.shot?.name).toBe('1A')
})

test('the agent loop works end to end: stage an entity in the new project', async () => {
  const placed = await rpc<{ entityId: string }>('add_entity', { assetId: 'person.man', x: 0, z: 0 })
  expect(placed.ok).toBe(true)
  const state = await rpc<{ scene: { entities: { id: string }[] } | null }>('get_state')
  expect(state.data!.scene?.entities.some((e) => e.id === placed.data!.entityId)).toBe(true)
  // Persist the edit so the reopen below restores it (exports of an unsaved
  // doc would otherwise reload the last saved project.json — by design).
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForTimeout(300)
})

test('open_project reopens a folder and restores its contents', async () => {
  // Switch away first so the reopen is real, not a no-op.
  const away = await rpc<{ project_name: string }>('new_project', {
    folder: join(smokeDir, 'Other.blockout')
  })
  expect(away.ok).toBe(true)
  expect(away.data!.project_name).toBe('Other')

  const body = await rpc<{ ok: boolean; project_name: string }>('open_project', {
    folder: join(smokeDir, 'Agent.blockout')
  })
  expect(body.ok, `open_project failed: ${body.error ?? ''}`).toBe(true)
  expect(body.data!.project_name).toBe('Agent Project')
  const state = await rpc<{ project: string; scene: { entities: unknown[] } | null }>('get_state')
  expect(state.data!.project).toBe('Agent Project')
  expect(state.data!.scene?.entities.length).toBe(1)
})

test('open_project with a missing project fails cleanly', async () => {
  const body = await rpc<{ project_name: string }>('open_project', {
    folder: join(smokeDir, 'does-not-exist.blockout')
  })
  expect(body.ok).toBe(false)
  expect(body.error).toContain('No project.json')
})

test('project actions require a folder over RPC — no native-dialog fallback', async () => {
  // A dialog fallback would park the RPC caller until a human answers a
  // save sheet; over the control server folder is mandatory instead.
  const created = await rpc<{ ok: boolean }>('new_project', {})
  expect(created.ok).toBe(false)
  expect(created.error).toBe('folder is required for RPC calls')
  const opened = await rpc<{ ok: boolean }>('open_project', {})
  expect(opened.ok).toBe(false)
  expect(opened.error).toBe('folder is required for RPC calls')
})

test('new_project refuses to clobber an existing project without overwrite', async () => {
  const folder = join(smokeDir, 'Agent.blockout')
  const refused = await rpc<{ ok: boolean; project_name: string }>('new_project', { folder })
  expect(refused.ok).toBe(false)
  expect(refused.error).toContain('Project already exists at')
  expect(refused.error).toContain('overwrite: true')
  // The existing project.json is untouched by the refusal.
  expect(JSON.parse(readFileSync(join(folder, 'project.json'), 'utf-8')).name).toBe('Agent Project')

  const replaced = await rpc<{ ok: boolean; project_name: string }>('new_project', {
    folder,
    overwrite: true,
    name: 'Replaced'
  })
  expect(replaced.ok, `new_project overwrite failed: ${replaced.error ?? ''}`).toBe(true)
  expect(replaced.data!.project_name).toBe('Replaced')
  expect(JSON.parse(readFileSync(join(folder, 'project.json'), 'utf-8')).name).toBe('Replaced')
  const state = await rpc<{ project: string }>('get_state')
  expect(state.data!.project).toBe('Replaced')
})

test('open_project auto-saves a dirty document before switching', async () => {
  // Stage an entity and do NOT hit Save — the doc is dirty in memory only.
  const placed = await rpc<{ entityId: string }>('add_entity', { assetId: 'person.man', x: 1, z: 1 })
  expect(placed.ok).toBe(true)

  const switched = await rpc<{ ok: boolean; project_name: string }>('open_project', {
    folder: join(smokeDir, 'Other.blockout')
  })
  expect(switched.ok, `open_project failed: ${switched.error ?? ''}`).toBe(true)
  expect(switched.data!.project_name).toBe('Other')

  // The dirty entity survived the switch: auto-save wrote it to disk and
  // reopening restores it.
  const saved = JSON.parse(readFileSync(join(smokeDir, 'Agent.blockout', 'project.json'), 'utf-8'))
  expect(saved.name).toBe('Replaced')
  expect(saved.scenes[0].entities.length).toBe(1)
  const back = await rpc<{ ok: boolean; project_name: string }>('open_project', {
    folder: join(smokeDir, 'Agent.blockout')
  })
  expect(back.ok).toBe(true)
  const state = await rpc<{ scene: { entities: unknown[] } | null }>('get_state')
  expect(state.data!.scene?.entities.length).toBe(1)
})
