# Modifications

This distribution is derived from Blockout by Sam Wasserman and retains the
original `LICENSE`, `NOTICE`, credits, and citation metadata.

Frozen upstream base: `6a85105101a0504e38c330b0caae010c957b2321`.

Portable desktop work added in 2026, contributed by
**Gumbii Digital** ([github.com/GumbiiDigital](https://github.com/GumbiiDigital)):

- Windows 11 x64 packaging with a per-user NSIS installer and native window chrome.
- Portable project-relative paths, Windows-safe filenames, and cross-platform UI labels.
- Shared platform configuration and FFmpeg discovery with deterministic asset checks.
- Versioned local-control discovery compatible with existing unversioned descriptors.
- Process-tree-aware export cancellation and cross-platform FFmpeg concat files.
- Windows/macOS/Linux CI, packaging provenance, third-party notices, and SBOM generation.

Downstream distributors should append their own branding and behavioral changes
to this file rather than replacing the original attribution.

Every upstream file changed by this port and capable of carrying comments has
a prominent first-lines notice pointing back to this manifest. The following
changed structured/generated files cannot accept comments without invalidating
their format, so this manifest is their file-level change notice:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.node.json`

New binary and structured release artifacts are likewise identified here:
`build/icon.ico` and `ASSET_MANIFEST.json`. Patch inputs retain their exact
patch syntax and are documented by path under `third_party/ffmpeg/`.

A stable or commercial distribution remains gated on upstream/trademark
permission, platform code signing/notarization, a final FFmpeg/H.264
distribution review, and the ordinary complete third-party compliance review.

## Upstream contribution branches (2026)

### `upstream/project-actions`

- New control actions `new_project` and `open_project` in
  `src/renderer/control/handler.ts` — the last manual step (creating/opening
  a project by hand) is now agent-drivable:
  - `new_project { folder, name?, overwrite? }` creates the folder (via the
    existing `project:save` IPC), derives the name from the folder basename
    when omitted, opens it through `store.newProject`, saves `project.json`,
    and returns `{ ok, project_path, project_name }`. `folder` is required —
    a missing one is an error, never a native-dialog fallback (a dialog would
    park an RPC caller until a human answers it). A folder that already
    contains `project.json` is refused with an error unless
    `overwrite: true` is passed — no silent clobbering.
  - `open_project { folder }` auto-saves the current project first when it
    has unsaved changes (switching projects replaces the in-memory doc),
    then loads through the same recovery order as the Welcome screen (newer
    autosave backup → project.json → backup) via `project:load` +
    `store.loadFromJson`, returns `{ ok, project_name }`. `folder` is
    required, same RPC rule.
- MCP tools `new_project` / `open_project` in `mcp/blockout-mcp.mjs` +
  README rows (35 tools).
- E2E: `tests/e2e/project-actions.spec.ts` — the full agent loop with no UI
  interaction (create → stage → reopen → error paths → no-folder RPC
  refusal → overwrite guard → dirty-doc auto-save on switch).
