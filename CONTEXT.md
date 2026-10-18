# Text to Speech

The Fluxta plugin that reads text aloud. Its Speak Action hands a Phrase to
the plugin's Speech Queue, which speaks Phrases one at a time with this
computer's own voices — a viewer's chat message, a Redemption, a deck button.

Fluxta's own words — Action, Run Variable, Event, Event Source, Event Field,
Value Source, If/Else, Plugin Editor, Action Editor, Plugin settings, Sound
Tag, Event Queue, Custom Queue, External Connection — mean what Fluxta's
[Terminology](https://fluxta.app/docs/plugins/getting-started/terminology)
says and are not redefined here. In particular a **run** is Fluxta's: one
execution of a program. Nothing in this plugin is called a run.

## Language

### Speech

**Phrase**:
One Speak's text as accepted into the Speech Queue: what is synthesized,
spoken, cut off and dropped. A Phrase that cannot be spoken — its Voice is
not here, its text is empty, the engine fails — is dropped, and the queue
moves on; nothing the user chose is substituted to save it.
_Avoid_: utterance (an engine's word, `AVSpeechUtterance`), message (a chat
message is the Platforms' word, and a deck button's Phrase is not one), sound
(what the host's Play Sound plays).

**Speech Queue**:
The plugin's single queue of Phrases, spoken strictly one at a time,
whatever the output device: one voice at a time. The plugin owns the order,
not the host — Speak only enqueues and returns, so neither the action
timeout nor a Custom Queue plays a part, and a burst of chat messages from
an Event whose runs execute in parallel still waits its turn. It lives in
memory: a restart of the plugin or of Fluxta loses every waiting Phrase and
the one being spoken.
_Avoid_: Queue or Custom Queue alone (the host's Event Queue orders runs,
not speech).

**Position**:
Where Speak puts its Phrase: **In turn** (the end of the queue, the
default), **Next** (ahead of every In turn Phrase, behind other Next ones,
without cutting off the current Phrase) or **Now** (cuts off the current
Phrase and is spoken at once).

**Tag**:
A label Speak attaches to its Phrase so Stop Speech can address it — a
viewer's user id, a chat message's id. A Phrase carries any number of Tags.
_Avoid_: Sound Tag (the host's, for Play Sound — the same idea, reaching
sounds only), channel (implies one at a time within it).

### Voices

**Provider**:
A source of Voices that turns text into audio: `system` — this computer's
voices — in v1, cloud services later. Every Provider returns audio, a whole
Phrase as WAV, and none speaks by itself: the Player plays it. It takes plain
text, never markup, and fails as `voice-missing`, `rejected`, `unavailable`
or `transient`. On macOS `system` is AVSpeechSynthesizer; on Windows it will
cover SAPI and OneCore. Another OS's Provider never appears.
_Avoid_: Platform (a streaming service in `fluxta-platforms`, an operating
system in the host), engine (SAPI, OneCore and AVSpeech are engines inside a
Provider).

**Voice**:
What Speak speaks with. It belongs to exactly one Provider and is known by
that Provider plus its own id, which means nothing to any other Provider — so
a Voice that is not here is reported missing, never swapped for another.
_Avoid_: speaker, narrator.

**Default Voice**:
The Voice a Speak uses unless it names one: chosen in Plugin settings, and
initially the voice the OS speaks with.
_Avoid_: system voice (that is only its initial value).

### Playback

**Player**:
What plays a Provider's audio — one per OS, the same for every Provider, and
the owner of volume. On macOS it is AVAudioEngine. It fails as
`device-missing`, `unavailable` or `transient`. Speech never passes through
the host's audio, so Stop Sound, Sound Tags and `system.isPlaying` do not
reach it.
_Avoid_: output (the device it plays on), speaker.
