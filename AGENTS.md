# AGENTS.md

This document provides instructions for agentic coding agents working in this repository.

## Project Overview

Fluxta Text to Speech is a [Fluxta](https://fluxta.app) plugin that reads text aloud with this computer's own voices. Its **Speak** Action puts a **Phrase** into the plugin's single **Speech Queue** — where its **Position** says — and returns at once; the queue speaks Phrases one at a time. **Stop Speech** ends Phrases early: the current one, every one, or those carrying a **Tag**. The motivating use is a stream read aloud: a chat Event of the `platforms` plugin runs Speak with the viewer's message, and the voice plays on a device OBS captures. A deck button uses Speak the same way. See `CONTEXT.md`.

It runs on macOS and on Windows 10 and 11. It is a pnpm workspace (turbo) of three TypeScript packages. The Plugin API it builds against — `@fluxta/sdk` and the `fluxta` CLI from `@fluxta/cli` — is owned by Fluxta, not by this repo (see [Working against Fluxta](#working-against-fluxta)).

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
pnpm test           # vitest in apps/plugin — on macOS and on Windows it also drives that OS's real engines, silently
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

- `apps/plugin` (`tts-plugin`) — the Plugin sidecar: the Node.js process Fluxta starts. tsdown bundles it into `dist/tts/index.mjs`, the engines' scripts inside it, and copies `manifest.json` and `icons/` beside it.
- `apps/editor` (`tts-editor`) — the Plugin Editor and the Action Editors, React + Vite, built into `dist/tts/editor/`.
- `packages/protocol` (`tts-protocol`) — what the sidecar and the editors share: every Action's settings type (`actions.ts`), the Defaults and their bounds (`defaults.ts`), the Presets, each Provider's settings and their bounds (`presets.ts`), and the messages between the editors and the sidecar (`editor.ts`). Consumed as TypeScript source; it has no build.

### Plugin sidecar (`apps/plugin/src`)

```
index.ts              composition root: the system Provider and Player, the Voices, the settings, the Speech Queue, the Actions, Sources, Events and the editors' channel
plugin.ts             the single `Plugin` instance from @fluxta/sdk/api
events.ts             the Event Sources' kinds: `phrase-started`, `phrase-finished`
manifest.test.ts      the manifest declares exactly what the sidecar registers and emits
speech/
  provider.ts         the Provider seam: Voice, Audio (WAV), the Provider's own settings, ProviderError and its kinds
  player.ts           the Player seam: Device, Output Device, PlayerError and its kinds
  speech-queue.ts     the Speech Queue, its Synthesis seam, and a dropped Phrase as it is told: its Drop and its log line
  listing.ts          a list looked up once and kept, and afresh when an editor opens
  voices.ts           the Provider's Voices, so kept; the OS's default voice
  truncate.ts         the Length Limit: cut at the last word boundary, counted in graphemes
  wav.ts              Float32 samples or 16-bit PCM → 16-bit WAV; a WAV's duration
system/
  index.ts            the `system` Provider and Player for the OS the sidecar runs on
  unsupported.ts      an OS they do not cover yet: every Phrase `unavailable`
  script-process.ts   one long-lived interpreter running a script: JSON lines, restarts, `unavailable` and `transient`
  script-player.ts    a Player over such a script: a temporary WAV file per play, its start, end, stop and watchdog
  fake-engine.ts      the Engine tests answer by hand
  macos/
    jxa-process.ts    the script in `osascript -l JavaScript`
    synthesizer.jxa   AVSpeechSynthesizer: voices, synthesis to PCM
    player.jxa        Core Audio's devices; AVAudioEngine, one engine per device: plays a WAV file, reports its end, stops, cuts it off when its device goes
    macos-provider.ts the macOS `system` Provider over synthesizer.jxa
    macos-player.ts   the macOS Player over player.jxa
  windows/
    powershell-process.ts  the script in Windows PowerShell 5.1, started by bootstrap.ps1
    bootstrap.ps1     `-EncodedCommand`: refuses ConstrainedLanguage, then runs the script read from stdin
    loop.ps1          the request loop every Windows script runs on
    synthesizer.ps1   SAPI (COM) and OneCore (WinRT): both stores' voices, synthesis to PCM or WAV
    player.ps1        Windows' audio endpoints; WinRT's MediaPlayer, one per play: plays a WAV file, reports its start and end, stops, cuts it off when its device goes
    windows-provider.ts the Windows `system` Provider: one voice list from both stores, ids `onecore:…` / `sapi:…`, each store's rate
    windows-player.ts the Windows Player over player.ps1
actions/              one StandaloneAction per manifest Action, file named after its `type`
  values.ts           what an interpolated setting holds: text, and Tags as they compare
sources/              the Query Sources `speaking` and `waiting`, read off the Speech Queue
settings/
  defaults.ts         the Defaults read warily, and a Speak's effective settings: its Overrides over them
  presets.ts          the Presets read warily: a Voice of a Provider this version knows, and that Provider's settings
  settings-store.ts   the Defaults and the Presets in Plugin Settings: read once, written only by the sidecar
  synthesis.ts        what speaks a Phrase: its Preset as it stands, bound to its Provider — or the OS's voice at 1.0×
  values.ts           what saved settings hold: records, and names never empty
editors/
  editor-channel.ts   the status every editor sees — Defaults, Presets, each Provider's Voices, Output Devices, Recent problems — the Plugin Editor's changes, and Listen
  listen.ts           a Listen's Phrase: the text typed beside the button, as the form stands — a Preset's dialog, or a Speak — over the Defaults
  recent-problems.ts  the last 20 dropped Phrases since the plugin started, newest first
  voice-options.ts    a Voice as the editors list it: `Milena — Russian (Russia)`, sorted
```

A Speak becomes a Phrase in the Speech Queue, where its Position puts it, carrying its Preset by id; when its turn comes, the queue asks `synthesisFor` for its synthesis — the Preset as it stands, bound to its Provider (`settings/synthesis.ts`) — runs it, and hands the WAV to the Player with the Phrase's volume and Output Device. The Player reports when the sound starts (`onStarted`), and the queue announces Phrase Started then and Phrase Finished when the play settles. Stopping a Phrase aborts its signal — whichever of the two is under way stops — or takes it out of the queue while it waits. Neither the Provider nor the Player knows about the queue, and the queue knows nothing of Presets, Providers or an OS — nor of Fluxta: `index.ts` turns its listeners into `emitEvent` calls.

### Editors (`apps/editor`)

- One HTML entry per editor at the package root, each mounting `src/<editor>/main.tsx`; `plugin.html` is the Plugin Editor. Fluxta never tells an editor which Action it edits — it only serves the path the manifest names. `vite.config.ts` picks up every `*.html` on its own.
- Every editor asks the sidecar for its status (`useStatus`) and hears it again whenever the Defaults or the Presets change. The Plugin Editor changes them by message, never with `setPluginSettings` of its own; a number field saves when it is left, not on every keystroke.
- The Plugin Editor's Presets are a list with a dialog (`plugin/Presets.tsx`, `PresetDialog.tsx`), as `fluxta-telegram`'s Chats: the dialog picks a Provider, then a Voice of it, then that Provider's settings, and checks the name with `presetProblem` before it sends `save-preset`; the sidecar gives a new Preset its id. The Default Preset's row has no Delete.
- What speaks — a Preset's Voice, Speak's Preset — is a `ListenField` (`shared/`), with **Listen** under it (`useListen`): a text input that starts as `LISTEN_TEXT` and is never saved, and the button, `type="button"` so it never submits a dialog. The sidecar tells every open editor, so a Listen carries the editor's own id and only its answer is taken. A Preset's dialog sends its unsaved Voice and settings as `speech`; Speak's editor sends its Preset and Overrides as they stand, unsaved.
- Speak's Preset field sits above its Override defaults, which hold only Volume, Output device and Length limit. A Preset field saves a Preset by id with its name (`shared/presets.ts`), so one that is not here is still shown by name.
- An Output Device field lists System default first, then the devices in the OS's order (`shared/devices.ts`). It saves a device with its name, so one that is not here is still shown by name, as _not available right now_.
- Editors are built from Fluxta's [UI Kit](https://fluxta.app/docs/plugins/reference/ui-kit) (`@fluxta/sdk/ui`). Text that can hold a `{{…}}` reference is a `TemplateField`.

## Key Conventions

- **Manifest and code change together.** `manifest.json` declares every Action, and the code registers exactly those, by the same `type`. Adding an Action means: its manifest entry, `apps/plugin/src/actions/<type>.ts` with tests, its registration in `index.ts`, its settings type in `tts-protocol`, an Action Editor page and an icon in `icons/` ([lucide-static](https://lucide.dev), `stroke="white"`).
- **Naming in the manifest** ([manifest reference](https://fluxta.app/docs/plugins/reference/manifest)): every kind — an Action or Event `type` — is kebab-case (`speak`, `stop-speech`, `phrase-started`); every key — a Source, a param, an Event Field, an Options Source — is camelCase (`speaking`, `waiting`). Fluxta drops an Event, a Source or a payload key the manifest does not declare without a word, so `manifest.test.ts` checks both sides.
- **The plugin owns the order of speech.** Speak never waits for its Phrase: it enqueues and returns, so the run moves on and the host's 30-second action timeout never cuts a Phrase short. There is one Speech Queue for the whole plugin.
- **Urgency is atomic inside Speak.** A Now becomes the current Phrase within its own Speak and cuts the old one off — "Stop Speech, then Speak" would let the queue start its next Phrase in between. It is spoken only once the Phrase it cut off has ended, so that one's Phrase Finished goes out before its own Phrase Started.
- **An empty Tag stops nothing.** Fluxta resolves an absent reference to `""`, so Stop Speech by Tag with nothing left after trimming does nothing at all — never Everything, which happens only when the user picks it. Speak discards an empty Tag. Tags compare exactly (`values.ts`); both Actions normalise them the same way.
- **Every Phrase Started is followed by exactly one Phrase Finished**, however the Phrase ended — cut off by Stop Speech or a Now, or the Player failing mid-phrase. A Phrase that never started (stopped while it waited, its synthesis failed, the Player failed before any sound) fires neither. The queue enforces it: it starts a Phrase at most once, whatever the Player reports, and runs every listener so that one that throws cannot stop the queue.
- **The sidecar is the only writer of Plugin Settings** — the Defaults and the Presets. It reads them once, at startup — Fluxta echoes every write back, and an echo can arrive after a newer change — and the Plugin Editor asks it for a change by message. A Speak waits for that first read, then reads the Defaults as they stand when it runs: an absent Override follows its Default, and one it cannot read follows it too rather than dropping the Phrase. Its Preset is read when its turn comes, so an edit reaches the Phrases already waiting.
- **A Preset is never substituted.** A Speak names it by id with its name; one that is not here — deleted, unreadable, another computer's — drops the Phrase as `voice-missing`, and the store keeps a Default Preset that did not load rather than falling back to the OS's voice. The Default Preset cannot be deleted. Until one is picked, the OS's voice speaks at 1.0×.
- **A Listen is out of a scenario's sight.** Its Phrase (`listen` holds the asking editor's id) waits as a Next one and Stop Speech reaches it, but the queue fires no Phrase Started or Phrase Finished for it and Speaking and Phrases Waiting leave it out. A Listen that cannot be heard is answered to its editor (`listen-failed`), not written to the log: it is not a viewer's lost Phrase.
- **Speaking and Phrases Waiting are pulled** (`resolve: "query"`) and read the queue as it stands: a pushed value read right after a Speak would depend on whether the push had arrived.
- **A Phrase that cannot be spoken is dropped, and the queue moves on.** Nothing the user chose is substituted to save it — no other Voice, no other device. Every drop is told once (`dropOf`): a `console.warn` line (`describeDrop`) — the kind, the reason, the beginning of the text — and an entry in Recent problems, the Plugin Editor's section with a red dot while it is not empty. A stopped Phrase is not a drop, and a Listen's goes to its editor instead.
- **A `transient` failure is tried once more, and only before any sound.** The queue tries the whole Phrase again — its Voice, synthesis and play — so a crashed engine starts afresh; a second failure drops it, and Stop Speech reaches it meanwhile. A Phrase whose sound has started is cut off, never repeated. Nothing about a failure is kept: no Unavailable state, no retry button — every Phrase tries afresh, so a fix outside is picked up with no restart.
- **The Provider seam.** A Provider takes plain text — an engine that reads markup gets the text escaped by its Provider, so chat cannot steer it — and returns a whole Phrase as 16-bit WAV. Each Provider has settings of its own (`Provider<Settings>`), kept by a Preset: `system` has Rate, a multiplier each engine maps and clamps. Volume is the Player's, the same for every Provider. Errors are closed sets: `voice-missing` / `rejected` / `unavailable` / `transient` for a Provider, `device-missing` / `unavailable` / `transient` for a Player, each with a reason a person can read. An abort rejects with the signal's reason and is not an error. A cloud Provider must fit the same seam.
- **No binary in the package.** The engines are scripts for what each OS ships: JXA for the `osascript` of every Mac, PowerShell for the Windows PowerShell 5.1 of every Windows 10 and 11. They are `.jxa` and `.ps1` files bundled as strings (`script-text.ts`, for tsdown and vitest alike) — nothing beside `index.mjs` to find at run time. They are not linted or formatted.
- **The JXA scripts rest on undocumented behaviour**: a JS function passed where an Objective-C block is expected is called as that block, but only when the script's run loop yields — so the loop yields every 5 ms while something is under way and every second when idle. Messages are JSON lines with an `id`; the sidecar escapes everything above ASCII, because the script decodes stdin in whatever pieces arrive. A script announces `{"ready":true}`: a process that exits before that is `unavailable`, one that exits after it crashed (`transient`). `ScriptProcess` starts one on first use and again after it exits; a script exits on end of stdin, so it never outlives the sidecar.
- **The PowerShell scripts are Windows PowerShell 5.1, and cannot be run on macOS.** PowerShell 7 cannot reach WinRT, and is not on every Windows. `powershell.exe` gets only the bootstrap, as `-EncodedCommand` — a command line holds 32K characters, and it is not a script file, so the execution policy does not apply. The bootstrap first refuses ConstrainedLanguage (AppLocker, WDAC) with `{"unavailable":…}`, in ASCII, then runs the loop and the engine's script, read from the first line of stdin. Replies go out through a UTF-8 writer of the script's own, audio as hand-written base64 lines. Nothing from PowerShell 7 — `??`, `&&`, `-AsHashtable`… (a test guards against those) — and every unwanted result goes to `$null`, or it becomes a function's return value. Their behaviour is checked only by `windows.integration.test.ts`, on Windows.
- **Windows' two voice stores are one list.** OneCore (WinRT) has the full Microsoft set; SAPI (COM) also has third-party voices such as RHVoice. A Voice's id carries its store (`onecore:…`, `sapi:…`); a voice in both — `Microsoft Irina` and `Microsoft Irina Desktop` — is listed once, as OneCore's; OneCore's default, chosen in Settings, is the OS's voice. Text goes to both as text: SAPI with `SVSFIsNotXML`, OneCore through `SynthesizeTextToStreamAsync`, which reads no SSML.
- **The Player never trusts AVAudioEngine to report an end, nor to keep its device.** An engine whose device goes away moves to the default output by itself — the speakers, possibly the stream — and then stops, without completing what was playing, or completing it at once as if it had ended; the configuration-change notification comes ~100 ms later. So the script watches every engine on each pass of its loop while something plays, and cuts a play off the moment its engine leaves its device or stops; a play on System default is cut off too once the OS's default output is another device. A node of such an engine is never stopped — its `stop` does not return — the engine is. The sidecar stops any play that runs 5 s past its length.
- **A Phrase never moves to another device.** The Output Device decides who hears it, so a device that is not here drops the Phrase (`device-missing`) and one that goes away mid-phrase cuts it off — never System default instead. A device is saved by the id the OS keeps for it across boots and re-plugging, with its name for the editors and the reasons: on macOS its Core Audio UID — an `AudioDeviceID` is a runtime id, resolved afresh for every play — on Windows its audio endpoint's `DeviceInformation.Id`.
- **The Windows Player pins every play to an endpoint and watches it.** MediaPlayer is given the endpoint as `AudioDevice` — on System default too, the one that is the default as the play starts — because one left on the default could follow it to another device. Nothing it raises can wake the loop, so while something plays the loop comes round every 5 ms: it reads the play's state and the `MediaEnded` and `MediaFailed` events queued for `Get-Event`, compares the default endpoint every 20 ms, and checks every 100 ms that a chosen endpoint is still enabled. A play that stops short of its end is cut off as `device-missing` if its endpoint went, `transient` otherwise; each cut-off writes what gave it away to stderr, the plugin's log. A play that has not started after 5 s is cut off too, since a failure may reach the script only as an event. Devices come from `DeviceInformation.FindAllAsync(MediaDevice.GetAudioRenderSelector())`, the default from `MediaDevice.GetDefaultAudioRenderId`; SAPI's `GetAudioOutputs` is not used — its WinMM names stop at 31 characters. `CommandManager.IsEnabled = $false` keeps Phrases out of Windows' media flyout.
- **Core Audio from JXA goes through `ObjC.bindFunction` with plain pointers.** Its device API is C only, and BridgeSupport's struct-pointer signatures crash `osascript`. A property's address is UInt32s in an `NSMutableData`; numbers come back through base64, strings through a `Ref`.
- **Nothing is ever played aloud in tests or experiments.** Plays run at volume 0. The integration tests (`*.integration.test.ts`) drive the real engines this way, each only on its own OS; everything else runs against fakes (`FakeEngine`, fake Providers and Players) and needs no OS.
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
