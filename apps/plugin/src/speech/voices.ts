import { ProviderError, type Provider } from "./provider";

/** The id of the voice the OS speaks with when none is chosen. */
export async function osDefaultVoice(provider: Provider): Promise<string> {
  const voices = await provider.voices();
  const voice = voices.find(({ isDefault }) => isDefault) ?? voices[0];
  if (!voice) {
    throw new ProviderError("voice-missing", "This computer has no voices");
  }
  return voice.id;
}
