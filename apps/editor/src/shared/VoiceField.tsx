import { Button, Field, SelectField, type SelectOption } from "@fluxta/sdk/ui";
import type { ReactNode } from "react";
import type { ListenSettings } from "tts-protocol";

import { useListen } from "./useListen";

type VoiceFieldProps = {
  label: string;
  options: SelectOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  hint?: ReactNode;
  /** Why there are no voices: the Provider's reason. */
  error?: string;
  loading?: boolean;
  placeholder?: string;
  /** What Listen speaks with — the form as it stands, unsaved. */
  listen: ListenSettings;
};

/**
 * The voice field, with Listen beside it: the Voice's name, spoken with the
 * form's rate, volume and output device. Why a Listen could not be heard
 * takes the place of the field's error.
 */
export function VoiceField({
  label,
  hint,
  error,
  listen: settings,
  ...select
}: VoiceFieldProps) {
  const { listen, problem } = useListen(settings);

  return (
    <Field label={label} hint={hint} error={problem ?? error}>
      <div className="with-listen">
        <SelectField {...select} />
        <Button variant="outline" onClick={listen}>
          Listen
        </Button>
      </div>
    </Field>
  );
}
