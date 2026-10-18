# Fluxta Text to Speech

A [Fluxta](https://fluxta.app) plugin that reads text aloud with this
computer's own voices — a viewer's chat message, a Redemption, a deck button.
It needs no account and no internet: the voices are the ones the operating
system ships.

It speaks on macOS today. Windows is on its way; until then every Phrase is
dropped there with the reason in the plugin's log.

## Speak

| Action    | What it does                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------- |
| **Speak** | Reads its **Text** aloud — once the Phrases before it have been spoken. The step does not wait. |

**Text** can hold variables, so an Event can read what triggered it — for
example the message of the Platforms plugin's **Twitch Chat Message**:

```
{{platforms.twitch-chat-message.message}}
```

Every Speak becomes a **Phrase** in the plugin's single **Speech Queue**.
Phrases are spoken one at a time, in the order they arrived, whatever started
them — a burst of chat messages waits its turn instead of talking over itself.
Speak returns as soon as its Phrase is queued, so the steps after it run at
once, and a long Phrase is never cut short by Fluxta's step timeout.

A Phrase is spoken in the voice macOS speaks with by default — the voice for
the system language — at its normal pace and full volume, on the system's
default output device. Choosing a voice, a pace, a volume and a device comes
next.

A Phrase that cannot be spoken — its text comes out empty, the voice is
missing — is dropped, and the queue moves on. Each one is written to the
plugin's log, with the reason and the beginning of its text. A restart of the
plugin or of Fluxta drops whatever was still waiting.

Speech plays through the plugin, not through Fluxta's own sounds: **Stop
Sound** does not stop it.

## Following the speech

Speak does not wait, so a scenario that has to act with the voice asks the
plugin instead.

| Event               | When it fires                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| **Phrase Started**  | A Phrase's sound starts — show an overlay in step with the voice.             |
| **Phrase Finished** | That Phrase has ended, whether it was spoken to the end or cut off — hide it. |

Every Phrase Started is followed by exactly one Phrase Finished, so an overlay
shown on one is never left on screen. A Phrase that was never heard — its
text was empty, its voice is missing — fires neither. Neither Event carries
fields yet: they say that a Phrase started or ended, not which one.

An **If/Else** can branch on:

- **Speaking** — whether a Phrase is being spoken (or prepared) right now;
- **Phrases Waiting** — how many Phrases wait behind it.

Both read the queue as it is when the condition runs. A raid that floods the
chat can be held back with `Phrases Waiting < 10` before Speak: the count
already includes a Phrase a Speak queued a moment before.

## Development

```bash
pnpm install
pnpm build        # builds dist/tts/ and restarts the plugin in a running Fluxta
pnpm dev          # rebuild on change
pnpm test         # on macOS this also drives the real voices — silently
pnpm lint && pnpm format:check
```

See [`AGENTS.md`](./AGENTS.md) for how the package is put together, and
Fluxta's [plugin docs](https://fluxta.app/docs/plugins) for the Plugin API.

## Releasing

`.github/workflows/release.yml` watches `manifest.json` on `main`. Push a
commit that bumps its `version`, and — once the `v<version>` tag doesn't
already exist — the workflow builds the plugin, packages it with
`fluxta package`, tags the commit, and opens a **draft** GitHub Release with
the zip attached. Publishing to Fluxta's catalog is `pnpm exec fluxta publish`.
