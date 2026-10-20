import type { Defaults } from "./defaults";

/** A Voice as the editors list it. */
export type VoiceOption = {
  id: string;
  /** `Milena — Russian (Russia)`, with its quality where it has one. */
  label: string;
};

/** What the sidecar tells every open editor. */
export type PluginStatus = {
  /** As saved in Plugin Settings. */
  defaults: Defaults;
  /**
   * The Default Voice as it stands: the one chosen, or the OS's own until
   * one is. `name` is absent when that voice is not on this computer.
   * Absent altogether when there are no voices to choose from.
   */
  defaultVoice?: { id: string; name?: string };
  /** Sorted by language, then name. */
  voices: VoiceOption[];
  /** Why there are no voices to list: the Provider's reason. */
  voicesProblem?: string;
};

/** What an editor asks of the sidecar. */
export type EditorMessage =
  /** The status, with the voices looked up afresh. */
  | { event: "get-status" }
  /** Saves the Plugin Editor's defaults; the sidecar reads them warily. */
  | { event: "set-defaults"; defaults: Defaults };

/** What the sidecar sends the editors. */
export type PluginMessage = { event: "status"; status: PluginStatus };

export function isEditorMessage(message: unknown): message is EditorMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const { event } = message as { event?: unknown };
  return event === "get-status" || event === "set-defaults";
}
