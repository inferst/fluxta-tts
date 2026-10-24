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
moves on; nothing the user chose is substituted to save it. A failure that
may pass (`transient`) before any sound is tried once more; one after the
sound started cuts the Phrase off. No failure is remembered: the next Phrase
tries afresh.
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
Phrase, which is not repeated, and is spoken at once — a Now cuts off another
Now too). A Now takes the current Phrase's place within its own Speak, so
nothing else can start in between.

**Tag**:
A label Speak attaches to its Phrase so Stop Speech can address it — a
viewer's user id, a chat message's id. A Phrase carries any number of Tags.
Tags compare as text, exactly — case included — without the whitespace
around them; a number from a lone reference becomes its string, so `123`
and `"123"` are one Tag. A Tag that comes out empty is discarded: nothing
could address it.
_Avoid_: Sound Tag (the host's, for Play Sound — the same idea, reaching
sounds only), channel (implies one at a time within it).

**Stop Speech**:
The Action that ends Phrases early, in one of three reaches: the **Current
Phrase** (cut off; the queue goes on), **Everything** (the current Phrase and
every waiting one, Next included) or a **Tag** (every waiting Phrase carrying
it, and the current one if it carries it). An empty Tag stops nothing — an
absent reference resolves to `""`, and that must not wipe the queue. A
stopped Phrase is not dropped: someone asked for it. One stopped while
waiting is simply gone; one cut off while heard fires its Phrase Finished.
_Avoid_: skip (only the Current Phrase reach), clear.

**Recent problems**:
The Plugin Editor's list of the last 20 Phrases dropped since the plugin
started, newest first: when, the error kind with its reason, and the
beginning of the text, so the viewer's lost message can be found. The run
that spoke a Phrase returned long ago and a plugin cannot fail it
(fluxta/hub#16), so this is where the streamer learns of a drop; each one is
also a line in the plugin's log. It lives in memory, as the Speech Queue
does. A Listen's failure is not among them: it goes to its editor.
_Avoid_: errors, log (the plugin's log is the host's, and holds more).

### Syncing with speech

Speak returns as soon as its Phrase is queued, so a scenario that must act
with the voice — an overlay while a Phrase is heard, a guard against a flood —
asks the plugin, not the step.

**Phrase Started**:
The Event Source `phrase-started`: a Phrase's sound has started — not its
synthesis — so whatever it shows lines up with the voice. It carries no
Fields.

**Phrase Finished**:
The Event Source `phrase-finished`: a Phrase that started has ended, however
it ended — spoken to the end, or cut off by Stop Speech, a Now or the Player
failing. It fires exactly once for every
Phrase Started, so whatever a scenario shows on Started is never left stuck;
a Phrase that never started fires neither. It carries no Fields.
_Avoid_: Phrase Completed, Phrase Stopped (one Event for every end).

**Speaking**:
The Value Source `speaking`: whether a Phrase is being handled, from the
moment it leaves the Speech Queue — its synthesis included — until it ends.

**Phrases Waiting**:
The Value Source `waiting`: how many Phrases wait in the Speech Queue, the
one being spoken not counted. Like Speaking it is pulled, read as the queue
stands when the condition runs — so `Phrases Waiting < 10 → Speak` right
after another Speak already counts that Speak's Phrase.
_Avoid_: Waiting alone (reads as yes or no), queue length.

### Voices

**Provider**:
A source of Voices that turns text into audio: `system` — this computer's
voices — in v1, cloud services later. Every Provider returns audio, a whole
Phrase as WAV, and none speaks by itself: the Player plays it. It takes plain
text, never markup, and fails as `voice-missing`, `rejected`, `unavailable`
or `transient`. On macOS `system` is AVSpeechSynthesizer. On Windows it
covers both voice stores — OneCore, through WinRT, and SAPI, through COM,
which also holds third-party voices — and a Voice's id carries its store; a
voice in both is listed once, as OneCore's. Another OS's Provider never
appears.
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
initially the voice the OS speaks with. One level only — "Default" on Speak
means the Default Voice, and there is no "System voice" entry that follows
the OS.
_Avoid_: system voice (that is only its initial value).

### Defaults

**Defaults**:
How every Speak speaks unless it overrides it, in Plugin settings: the
Default Voice, the rate (a multiplier, 0.5×–2×), the volume (0–100 %, the
Player's), the Output Device and the Length Limit. A fresh install speaks
with their initial values — the OS's voice, 1.0×, 100 %, System default,
200 — without the Plugin Editor ever being opened. A Speak reads them when it runs, so a change applies to the
next Speak.

**Override**:
A Speak's own value for one of the Defaults. Each is either **Default**,
which follows Plugin settings, or its own value, and all start at Default —
so a shared scenario speaks with the Defaults of whatever computer runs it.
Text, Position and Tags are not Overrides: they describe the Phrase, and
have no default.

**Length Limit**:
The most graphemes a Phrase keeps, counted after interpolation: longer text
is cut at the last word boundary within it and the rest is not spoken, so no
emoji or accented letter is split and no word is heard half-said. A Length
Limit can be off — no limit. An engine's own limit is not this: it stays the
Provider's `rejected`.
_Avoid_: character limit, max length (it counts graphemes, not characters).

**Listen**:
An editor's preview of a Voice: the text typed beside the button — an
English greeting when it is blank — spoken with the form's rate, volume and
Output Device, unsaved; on Speak, what the form leaves at Default follows
Plugin settings. The text is the editor's own: it is not saved, and no
Length Limit cuts it. It goes through the Speech Queue as a Next Phrase, so
it never talks over a viewer, and Stop Speech reaches it. Scenarios do not
see it otherwise: it carries no Tags, fires neither Phrase Started nor
Phrase Finished, and Speaking and Phrases Waiting leave it out. Its failure
goes to the editor that asked, shown beside the button, not to the plugin's
log.
_Avoid_: preview, test, sample.

### Playback

**Player**:
What plays a Provider's audio on an Output Device — one per OS, the same for
every Provider, and the owner of volume. On macOS it is AVAudioEngine, one
engine per device; on Windows, SAPI's `SpeakStream`, on System default only
so far. It fails as `device-missing`, `unavailable` or
`transient`. Speech never passes through the host's audio, so Stop Sound,
Sound Tags and `system.isPlaying` do not reach it.
_Avoid_: output (the device it plays on), speaker.

**Output Device**:
The device a Phrase plays on, which decides who hears it — chat on a device
OBS captures, a streamer-only Phrase in headphones. Either System default or
one device, known by the id the OS keeps for it across restarts and saved
with its name. The Player lists them in the OS's order under the OS's names,
as the host's Play Sound does. A Phrase never moves to another device: one
that is not connected when the Phrase's turn comes drops it
(`device-missing`), and one that goes away mid-phrase cuts it off.
_Avoid_: output alone (reads as the Player), sink.

**System default**:
The Output Device that is whatever the OS plays on when the Phrase starts. A
value, not a Default level: "Default" on Speak follows Plugin settings,
which may themselves be System default. Should the OS switch its output
mid-phrase, the Phrase is cut off, and the next one plays on the new output.
_Avoid_: default device (reads as the Default level).
