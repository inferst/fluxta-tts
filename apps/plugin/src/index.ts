import { isEditorMessage } from "tts-protocol";

import { SpeakAction } from "./actions/speak";
import { StopSpeechAction } from "./actions/stop-speech";
import { EditorChannel } from "./editors/editor-channel";
import { PHRASE_FINISHED_EVENT, PHRASE_STARTED_EVENT } from "./events";
import { plugin } from "./plugin";
import { DefaultsStore } from "./settings/defaults-store";
import { createSpeakingSource } from "./sources/speaking";
import { createWaitingSource } from "./sources/waiting";
import { describeDrop, SpeechQueue } from "./speech/speech-queue";
import { Voices } from "./speech/voices";
import { systemSpeech } from "./system";

const { provider, player } = systemSpeech();
const voices = new Voices(provider);
const defaults = new DefaultsStore(plugin, () => void editors.publish());
const editors = new EditorChannel(plugin, defaults, voices);

const queue = new SpeechQueue({
  provider,
  player,
  voiceFor: async ({ voice }) => voice ?? voices.osDefault(),
  // stderr lands in the plugin's log (`logs/tts.log` in its folder).
  onDropped: (phrase, error) => console.warn(describeDrop(phrase, error)),
  onStarted: () => plugin.emitEvent(PHRASE_STARTED_EVENT, {}),
  onFinished: () => plugin.emitEvent(PHRASE_FINISHED_EVENT, {}),
});

plugin.registerAction(new SpeakAction(queue, defaults));
plugin.registerAction(new StopSpeechAction(queue));
plugin.registerSource(createSpeakingSource(queue));
plugin.registerSource(createWaitingSource(queue));

// Attached before connecting, so nothing an editor already open sends is
// missed. A message that arrives before the settings waits for them.
plugin.onReceiveFromEditor((message: unknown) => {
  if (isEditorMessage(message)) {
    void editors.handle(message);
  }
});

await plugin.connect();

// Read once — the store explains why the echoes of its own writes are not
// read again. Settings are only readable over the authenticated connection.
try {
  const { payload } = await plugin.getPluginSettings();
  defaults.load(payload);
} catch (error) {
  console.warn(
    "Could not read the plugin's settings; using the defaults:",
    error,
  );
  defaults.load(undefined);
}
await editors.publish();
