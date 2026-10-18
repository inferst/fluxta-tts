import { SpeakAction } from "./actions/speak";
import { plugin } from "./plugin";
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
});

plugin.registerAction(new SpeakAction(queue));

await plugin.connect();
