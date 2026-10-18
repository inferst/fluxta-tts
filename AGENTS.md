# AGENTS.md

This document provides instructions for agentic coding agents working in this repository.

## Project Overview

Fluxta Text to Speech is a [Fluxta](https://fluxta.app) plugin that reads text aloud with this computer's own voices. Its **Speak** Action puts a **Phrase** into the plugin's single **Speech Queue** and returns at once; the queue speaks Phrases one at a time. The motivating use is a stream read aloud: a chat Event of the `platforms` plugin runs Speak with the viewer's message, and the voice plays on a device OBS captures. A deck button uses Speak the same way. See `CONTEXT.md`.

It runs on macOS today; Windows answers every Phrase with `unavailable` until its own Provider and Player arrive. It is a pnpm workspace (turbo) of three TypeScript packages. The Plugin API it builds against — `@fluxta/sdk` and the `fluxta` CLI from `@fluxta/cli` — is owned by Fluxta, not by this repo (see [Working against Fluxta](#working-against-fluxta)).

## Commands

### Setup

```bash
pnpm install     # Node ≥ 22.18, the pnpm version pinned in package.json
```

### Development & Build

```bash
pnpm build          # wipe dist/ and build the editors and the sidecar into dist/tts/
pnpm dev            # build the editors once, then watch both apps
pnpm typecheck      # tsc --noEmit in every package
pnpm test           # vitest in apps/plugin — on macOS it also drives the real engines, silently
pnpm lint           # eslint over the whole workspace
pnpm format         # prettier --write; `pnpm format:check` only checks
```

`fluxta publish` runs `lint` and `format:check` itself and stops if either fails.

### Target a specific package

```bash
pnpm --filter tts-plugin test
pnpm --filter tts-plugin exec vitest run src/speech
pnpm --filter tts-editor build
```

### Run it in Fluxta

`dist/tts/` is the build folder Fluxta loads (see Fluxta's [Development](https://fluxta.app/docs/plugins/getting-started/development) guide). Every successful sidecar build — `pnpm build` included — ends with `fluxta restart`, which, while Fluxta is running, links this build and restarts the plugin in it.

```bash
pnpm exec fluxta link dist/tts   # a development link to this build
pnpm dev                         # every successful sidecar build runs `fluxta restart`
pnpm exec fluxta link --status   # what is linked
pnpm exec fluxta unlink          # back to the installed package
```

Editor-only rebuilds restart nothing — reopen the editor in Fluxta to see them. The sidecar logs to `dist/tts/logs/tts.log`; `pnpm build` wipes `dist/` and the log with it.

## Architecture

### Packages

- `apps/plugin` (`tts-plugin`) — the Plugin sidecar: the Node.js process Fluxta starts. tsdown bundles it into `dist/tts/index.mjs`, the JXA scripts inside it, and copies `manifest.json` and `icons/` beside it.
- `apps/editor` (`tts-editor`) — the Action Editors, React + Vite, built into `dist/tts/editor/`.
- `packages/protocol` (`tts-protocol`) — what the sidecar and the editors share: every Action's settings type (`actions.ts`). Consumed as TypeScript source; it has no build.

### Plugin sidecar (`apps/plugin/src`)

```
index.ts              composition root: the system Provider and Player, the Speech Queue, the Actions
plugin.ts             the single `Plugin` instance from @fluxta/sdk/api
speech/
  provider.ts         the Provider seam: Voice, Audio (WAV), ProviderError and its kinds
  player.ts           the Player seam: PlayerError and its kinds
  speech-queue.ts     the Speech Queue, and the log line of a dropped Phrase
  voices.ts           the OS's default voice
  wav.ts              Float32 samples → 16-bit WAV; a WAV's duration
system/
  index.ts            the `system` Provider and Player for the OS the sidecar runs on
  unsupported.ts      an OS they do not cover yet: every Phrase `unavailable`
  macos/
    jxa-process.ts    one long-lived `osascript -l JavaScript` running a script
    synthesizer.jxa   AVSpeechSynthesizer: voices, synthesis to PCM
    player.jxa        AVAudioEngine: plays a WAV file, reports its end, stops
    macos-provider.ts the macOS `system` Provider over synthesizer.jxa
    macos-player.ts   the macOS Player over player.jxa
actions/              one StandaloneAction per manifest Action, file named after its `type`
```

A Speak becomes a Phrase in the Speech Queue; when its turn comes, the queue asks for its Voice, has the Provider synthesize it, and hands the WAV to the Player. Neither the Provider nor the Player knows about the queue, and the queue knows nothing of an OS.

### Editors (`apps/editor`)

- One HTML entry per editor at the package root, each mounting `src/<editor>/main.tsx`. Fluxta never tells an editor which Action it edits — it only serves the path the manifest names. `vite.config.ts` picks up every `*.html` on its own.
- Editors are built from Fluxta's [UI Kit](https://fluxta.app/docs/plugins/reference/ui-kit) (`@fluxta/sdk/ui`). Text that can hold a `{{…}}` reference is a `TemplateField`.

## Key Conventions

- **Manifest and code change together.** `manifest.json` declares every Action, and the code registers exactly those, by the same `type`. Adding an Action means: its manifest entry, `apps/plugin/src/actions/<type>.ts` with tests, its registration in `index.ts`, its settings type in `tts-protocol`, an Action Editor page and an icon in `icons/` ([lucide-static](https://lucide.dev), `stroke="white"`).
- **Naming in the manifest** ([manifest reference](https://fluxta.app/docs/plugins/reference/manifest)): every kind — an Action or Event `type` — is kebab-case (`speak`, `stop-speech`, `phrase-started`); every key — a Source, a param, an Event Field, an Options Source — is camelCase (`speaking`, `waiting`).
- **The plugin owns the order of speech.** Speak never waits for its Phrase: it enqueues and returns, so the run moves on and the host's 30-second action timeout never cuts a Phrase short. There is one Speech Queue for the whole plugin.
- **A Phrase that cannot be spoken is dropped, and the queue moves on.** Nothing the user chose is substituted to save it — no other Voice, no other device. Every drop is a `console.warn` line (`describeDrop`): the kind, the reason, the beginning of the text. A stopped Phrase is not a drop.
- **The Provider seam.** A Provider takes plain text — an engine that reads markup gets the text escaped by its Provider, so chat cannot steer it — and returns a whole Phrase as 16-bit WAV. Rate is the only synthesis parameter, a multiplier each Provider maps and clamps; volume is the Player's. Errors are closed sets: `voice-missing` / `rejected` / `unavailable` / `transient` for a Provider, `device-missing` / `unavailable` / `transient` for a Player, each with a reason a person can read. An abort rejects with the signal's reason and is not an error. A cloud Provider must fit the same seam.
- **No binary in the package.** The macOS engines are JXA scripts, run by the `osascript` every Mac ships. They are `.jxa` files bundled as strings (`jxa-text.ts`, for tsdown and vitest alike) and passed to `osascript -e` — nothing beside `index.mjs` to find at run time. They are not linted or formatted.
- **The JXA scripts rest on undocumented behaviour**: a JS function passed where an Objective-C block is expected is called as that block, but only when the script's run loop yields — so the loop yields every 5 ms while something is under way and every second when idle. Messages are JSON lines with an `id`; the sidecar escapes everything above ASCII, because the script decodes stdin in whatever pieces arrive. A script announces `{"ready":true}`: a process that exits before that is `unavailable`, one that exits after it crashed (`transient`). `JxaProcess` starts one on first use and again after it exits; a script exits on end of stdin, so it never outlives the sidecar.
- **The Player never trusts AVAudioEngine to report an end.** A configuration change stops the engine without calling a play's completion, so the script fails what was playing, and the sidecar stops any play that runs 5 s past its length.
- **Nothing is ever played aloud in tests or experiments.** Plays run at volume 0. The macOS integration test (`*.integration.test.ts`) drives the real engines this way and runs only on macOS; everything else runs against fakes (`FakeEngine`, fake Providers and Players) and needs no OS.
- **The sidecar bundle is self-contained.** Fluxta runs it with a bundled Node and no `node_modules`, so tsdown inlines every non-builtin dependency (`noExternal`). Do not externalize one.
- **File naming**: the sidecar and `tts-protocol` use kebab-case (`speech-queue.ts`, `macos-provider.ts`). In the editors, React components are PascalCase (`SpeakEditor.tsx`), hooks are `useThing.ts`.
- **Tests**: vitest, colocated `*.test.ts`.
- **Comments say why** — the Fluxta or OS behaviour that forces the code — and use the capitalized terms of `CONTEXT.md` and Fluxta's [Terminology](https://fluxta.app/docs/plugins/getting-started/terminology).

## Working against Fluxta

- **Fluxta owns the Plugin API contract**: `@fluxta/sdk`, the manifest schema and the `fluxta` CLI, documented at [fluxta.app/docs/plugins](https://fluxta.app/docs/plugins). When this plugin needs something they do not offer, do not work around the contract or patch `node_modules`: record the need in an issue here, label it `ready-for-human`, and stop — a person takes it to Fluxta (see `docs/agents/issue-tracker.md`). Once a release of the SDK or CLI provides it, it is adopted here.
- **The plugin plays speech itself, by design**: plugins are self-sufficient and the host only mediates between them, so speech does not go through the host's audio (fluxta/hub#11). That is a decision, not a gap to report.
- **The SDK and the CLI come from npm**, pinned once in the `catalog:` of `pnpm-workspace.yaml`; every package says `"catalog:"`. The installed typings — `apps/plugin/node_modules/@fluxta/sdk/dist/api.d.mts` (sidecar) and `ui.d.mts` (editors) — are the contract at the version in use; Fluxta's own working tree may be ahead of it.
- **Adopting a new SDK or CLI version**: bump its `catalog:` entry, add the exact version to `minimumReleaseAgeExclude` if pnpm refuses it as too young, `pnpm install`, and commit `pnpm-workspace.yaml` and `pnpm-lock.yaml` together.
- **Versions and publication**: the plugin's version is `version` in `manifest.json`. `pnpm exec fluxta publish` validates the package and opens a pull request to Fluxta's trusted catalog (`fluxta/plugins`). The catalog can hold a newer version than this repo, and `fluxta publish` merges against it rather than overwriting it. See Fluxta's [Publishing](https://fluxta.app/docs/plugins/getting-started/publishing) guide. Pushing a `version` bump to `main` also tags a draft GitHub Release (`.github/workflows/release.yml`).
- **Publishing is the user's call.** Run `fluxta publish` only when the user asks for it in the conversation.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/) without a scope, lowercase and imperative: `feat: speak a Phrase in this computer's voice on macOS`, `fix: …`, `chore: bump version`.

## Agent skills

- Issues: GitHub Issues at `inferst/fluxta-tts`. See `docs/agents/issue-tracker.md`.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- Domain: `CONTEXT.md`, plus Fluxta's plugin docs. See `docs/agents/domain.md`.
