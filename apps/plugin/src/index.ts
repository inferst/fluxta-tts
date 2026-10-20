import { SpeakAction } from "./actions/speak";
import { StopSpeechAction } from "./actions/stop-speech";
import { PHRASE_FINISHED_EVENT, PHRASE_STARTED_EVENT } from "./events";
import { plugin } from "./plugin";
import { createSpeakingSource } from "./sources/speaking";
import { createWaitingSource } from "./sources/waiting";
import { describeDrop, SpeechQueue } from "./speech/speech-queue";
import { osDefaultVoice } from "./speech/voices";
import { systemSpeech } from "./system";

const { provider, player } = systemSpeech();

const queue = new SpeechQueue({
  provider,
  player,
  voiceFor: () => osDefaultVoice(provider),
  // stderr lands in the plugin's log (`logs/tts.log` in its folder).
  onDropped: (phrase, error) => console.warn(describeDrop(phrase, error)),
  onStarted: () => plugin.emitEvent(PHRASE_STARTED_EVENT, {}),
  onFinished: () => plugin.emitEvent(PHRASE_FINISHED_EVENT, {}),
});

plugin.registerAction(new SpeakAction(queue));
plugin.registerAction(new StopSpeechAction(queue));
plugin.registerSource(createSpeakingSource(queue));
plugin.registerSource(createWaitingSource(queue));

await plugin.connect();
