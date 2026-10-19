# Fluxta Text to Speech

A [Fluxta](https://fluxta.app) plugin that reads text aloud with this
computer's own voices — a viewer's chat message, a Redemption, a deck button.
It needs no account and no internet: the voices are the ones the operating
system ships.

It speaks on macOS today. Windows is on its way; until then every Phrase is
dropped there with the reason in the plugin's log.

## Speak

| Action          | What it does                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| **Speak**       | Reads its **Text** aloud, in the place its **Position** gives it in the queue. The step does not wait. |
| **Stop Speech** | Ends Phrases early: the one being spoken, every one, or every one carrying a **Tag**.                  |

**Text** can hold variables, so an Event can read what triggered it — for
example the message of the Platforms plugin's **Twitch Chat Message**:

```
{{platforms.twitch-chat-message.message}}
```

Every Speak becomes a **Phrase** in the plugin's single **Speech Queue**.
Phrases are spoken one at a time — a burst of chat messages waits its turn
instead of talking over itself. Speak returns as soon as its Phrase is
queued, so the steps after it run at once, and a long Phrase is never cut
short by Fluxta's step timeout.

A Phrase is spoken as **Settings → Text to Speech** says — see
[Defaults](#defaults) — on the system's default output device. Choosing the
device comes next.

A Phrase that cannot be spoken — its text comes out empty, the voice is
missing — is dropped, and the queue moves on. Each one is written to the
plugin's log, with the reason and the beginning of its text. A restart of the
plugin or of Fluxta drops whatever was still waiting.

Speech plays through the plugin, not through Fluxta's own sounds: **Stop
Sound** does not stop it — **Stop Speech** does.

### Position

| Position    | Where the Phrase goes                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------- |
| **In turn** | To the end of the queue. The default.                                                              |
| **Next**    | Ahead of every In turn Phrase, behind other Next ones — a paid Redemption goes before chat.        |
| **Now**     | Cuts off the Phrase being spoken and is spoken at once — a deck "BRB". The queue goes on after it. |

A Phrase a Now cuts off is not repeated. A Now cuts off another Now too.
The cut-in happens inside the one Speak, so nothing else starts in between —
unlike a Stop Speech followed by a Speak.

### Tags and Stop Speech

**Tags** label a Phrase so that **Stop Speech** can find it later — say the
viewer's id and the message's id:

```
{{platforms.twitch-chat-message.userId}}
{{platforms.twitch-chat-message.messageId}}
```

Stop Speech reaches one of:

- **Current Phrase** — cuts off the Phrase being spoken; the queue goes on;
- **Everything** — cuts it off and empties the queue, Next Phrases included;
- **Tag** — takes every waiting Phrase carrying the Tag out of the queue, and
  cuts off the one being spoken if it carries it too.

So moderation reaches the speech as well as the chat:

| Event                      | Stop Speech                                          |
| -------------------------- | ---------------------------------------------------- |
| **Twitch User Banned**     | Tag `{{platforms.twitch-user-banned.userId}}`        |
| **Twitch User Timed Out**  | Tag `{{platforms.twitch-user-timed-out.userId}}`     |
| **Twitch Message Deleted** | Tag `{{platforms.twitch-message-deleted.messageId}}` |
| **Twitch Chat Cleared**    | Everything                                           |

Tags are compared exactly, case included, without the spaces around them; a
number and the same number as text are one Tag. A Tag that comes out empty is
left off the Phrase — and **Stop Speech with an empty Tag stops nothing**, so
an Event that misses its id never wipes the whole queue. Everything happens
only when you choose it.

## Defaults

**Settings → Text to Speech** holds how every Speak speaks unless it says
otherwise:

| Setting           | What it is                                                                                                    | At first                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Default Voice** | Every voice on this computer, by language, then name — with its quality (Enhanced, Premium) where it has one. | The voice macOS speaks with         |
| **Rate**          | 0.5× to 2.0×; 1.0× is the voice's normal pace.                                                                | 1.0×                                |
| **Volume**        | 0–100 %, no boost.                                                                                            | 100 %                               |
| **Length limit**  | Longer text is cut at the last word within this many characters, and the rest is not spoken. Empty: no limit. | 200 — about 12–15 seconds of speech |

So a fresh install speaks without the settings ever being opened, and a
change there applies to the next Speak — nothing restarts. The length limit
counts characters as a reader sees them: an emoji or an accented letter is
one, and is never split.

A Speak can override any of them under **Override defaults** — a louder voice
for a Redemption, a longer limit for paid TTS. Each field starts at
**Default**, which follows the settings; on another computer a Speak left at
Default speaks with that computer's Default Voice. A Speak that names a voice
this computer does not have shows it as _not available right now_.

## Following the speech

Speak does not wait, so a scenario that has to act with the voice asks the
plugin instead.

| Event               | When it fires                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| **Phrase Started**  | A Phrase's sound starts — show an overlay in step with the voice.             |
| **Phrase Finished** | That Phrase has ended, whether it was spoken to the end or cut off — hide it. |

Every Phrase Started is followed by exactly one Phrase Finished, so an overlay
shown on one is never left on screen — a Phrase cut off by Stop Speech or by
a Now included. A Phrase that was never heard — stopped while it waited, its
text empty, its voice missing — fires neither. Neither Event carries
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
