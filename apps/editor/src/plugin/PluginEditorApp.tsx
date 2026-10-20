import {
  EditorPage,
  PluginEditorLayout,
  SelectField,
  usePluginEditor,
} from "@fluxta/sdk/ui";
import { useEffect, useState } from "react";
import {
  formatRate,
  RATES,
  VOLUME_MAX,
  type Defaults,
  type PluginStatus,
} from "tts-protocol";

import { SavedNumberField } from "../shared/SavedNumberField";
import { sendToPlugin } from "../shared/sendToPlugin";
import { useStatus } from "../shared/useStatus";

/**
 * How long to wait for the sidecar before saying the plugin process itself is
 * not answering — distinct from the Editor's own link to Fluxta, which
 * `<PluginEditorProvider>` already reports on.
 */
const SIDECAR_TIMEOUT_MS = 3000;

export function PluginEditorApp() {
  const status = useStatus();
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSilent(true), SIDECAR_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!status) {
    return (
      <EditorPage>
        {silent ? (
          <p className="hint">
            The plugin process is not answering. Fluxta does not restart a
            crashed process — start the plugin again from the settings list, and
            check its log if it keeps failing.
          </p>
        ) : null}
      </EditorPage>
    );
  }

  return (
    <PluginEditorLayout
      sections={[
        {
          id: "defaults",
          label: "Defaults",
          content: <DefaultsForm status={status} />,
        },
      ]}
    />
  );
}

const RATE_OPTIONS = RATES.map((rate) => ({
  value: String(rate),
  label: formatRate(rate),
}));

function DefaultsForm({ status }: { status: PluginStatus }) {
  const editor = usePluginEditor();
  const { defaults, defaultVoice, voices, voicesProblem } = status;

  const save = (changes: Partial<Defaults>) =>
    sendToPlugin(editor, {
      event: "set-defaults",
      defaults: { ...defaults, ...changes },
    });

  return (
    <EditorPage>
      <p className="hint">
        How every Speak speaks unless it overrides it, under Override defaults.
      </p>

      <SelectField
        label="Default Voice"
        options={voices.map(({ id, label }) => ({ value: id, label }))}
        value={defaultVoice?.id}
        onChange={(voice) => save({ voice })}
        placeholder="No voices"
        error={voicesProblem}
        hint="Until you pick one, it is the voice this computer speaks with."
      />

      <SelectField
        label="Rate"
        options={RATE_OPTIONS}
        value={String(defaults.rate)}
        onChange={(rate) => save({ rate: Number(rate) })}
        searchable={false}
        missingLabel={(rate) => formatRate(Number(rate))}
        hint="1.0× is the voice’s normal pace."
      />

      <SavedNumberField
        label="Volume, %"
        saved={defaults.volume}
        onSave={(volume) => save({ volume: volume ?? VOLUME_MAX })}
        min={0}
        max={VOLUME_MAX}
        hint="100 % is the voice as it is synthesized, with no boost."
      />

      <SavedNumberField
        label="Length limit"
        saved={defaults.lengthLimit ?? undefined}
        onSave={(lengthLimit) => save({ lengthLimit: lengthLimit ?? null })}
        min={1}
        placeholder="No limit"
        hint="Longer text is cut at the last word within this many characters, and the rest is not spoken. An emoji counts as one. Empty: no limit."
      />
    </EditorPage>
  );
}
