import { Dialog, SelectField, TextField } from "@fluxta/sdk/ui";
import { useState } from "react";
import {
  formatRate,
  INITIAL_SYSTEM_SETTINGS,
  presetProblem,
  RATES,
  SYSTEM_PROVIDER,
  type Preset,
  type PresetDraft,
  type PresetVoice,
  type ProviderOption,
  type ProviderName,
  type SystemSettings,
} from "tts-protocol";

import { ListenField } from "../shared/ListenField";

type PresetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The Preset being edited; absent when adding one. */
  preset?: Preset;
  /** Every other Preset, so a clashing name is caught here. */
  others: readonly Preset[];
  providers: readonly ProviderOption[];
  onSave: (draft: PresetDraft) => void;
};

const RATE_OPTIONS = RATES.map((rate) => ({
  value: String(rate),
  label: formatRate(rate),
}));

/**
 * A Preset's dialog: its name, then its Provider, a Voice of that Provider
 * and that Provider's settings — and Listen, which speaks the form as it
 * stands, unsaved, with the Defaults' volume and output device.
 */
export function PresetDialog({
  open,
  onOpenChange,
  title,
  preset,
  others,
  providers,
  onSave,
}: PresetDialogProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ProviderName>(SYSTEM_PROVIDER);
  const [voice, setVoice] = useState<PresetVoice>();
  const [settings, setSettings] = useState<SystemSettings>(
    INITIAL_SYSTEM_SETTINGS,
  );

  // A reopened dialog shows the Preset as it stands now, not whatever was
  // last typed into it — reset while rendering the opening, which React
  // prefers over an effect that would render the stale values first.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(preset?.name ?? "");
      setProvider(preset?.voice.provider ?? SYSTEM_PROVIDER);
      setVoice(preset?.voice);
      setSettings(preset?.settings ?? INITIAL_SYSTEM_SETTINGS);
    }
  }

  const offered = providers.find(({ name }) => name === provider);
  // A Voice of another Provider is not this Provider's to show.
  const chosen = voice?.provider === provider ? voice : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onSubmit={() => {
        const draft = { id: preset?.id, name: name.trim(), voice: chosen };
        const problem = presetProblem(draft, others);
        if (problem !== undefined || !draft.voice) {
          return problem;
        }
        onSave({ ...draft, voice: draft.voice, settings });
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        placeholder="Chat"
        hint="Shown wherever a Speak picks this Preset."
      />

      <SelectField
        label="Provider"
        options={providers.map(({ name, label }) => ({ value: name, label }))}
        value={provider}
        onChange={(value) => setProvider(value as ProviderName)}
        searchable={false}
      />

      <ListenField
        label="Voice"
        options={(offered?.voices ?? []).map(({ id, label }) => ({
          value: id,
          label,
        }))}
        value={chosen?.id}
        onChange={(id) => {
          const listed = offered?.voices.find((option) => option.id === id);
          setVoice({ provider, id, name: listed?.name ?? id });
        }}
        missingLabel={(id) =>
          `${chosen?.id === id ? chosen.name : id} — not available right now`
        }
        placeholder="Choose a voice"
        error={offered?.problem}
        hint="Listen waits for the Phrase being spoken, then goes ahead of the rest."
        listen={chosen && { speech: { voice: chosen, settings } }}
      />

      <SelectField
        label="Rate"
        options={RATE_OPTIONS}
        value={String(settings.rate)}
        onChange={(rate) => setSettings({ ...settings, rate: Number(rate) })}
        searchable={false}
        missingLabel={(rate) => formatRate(Number(rate))}
        hint="1.0× is the voice’s normal pace."
      />
    </Dialog>
  );
}
