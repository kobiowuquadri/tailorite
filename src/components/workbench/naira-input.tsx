"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { koboToNairaInput, nairaInputToKobo } from "@/lib/format";

/** Naira amount field that stores integer kobo. Shows an inline hint for unreadable amounts. */
export function NairaInput({
  id,
  valueKobo,
  onChange,
  disabled,
  invalid,
  placeholder = "0",
}: {
  id: string;
  valueKobo: number | null;
  onChange: (kobo: number | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => koboToNairaInput(valueKobo));
  const [bad, setBad] = useState(false);
  const [seenValue, setSeenValue] = useState(valueKobo);
  if (valueKobo !== seenValue) {
    // Adopt external changes (e.g. a server action) unless the typed text already means the same amount.
    setSeenValue(valueKobo);
    if (nairaInputToKobo(text) !== valueKobo) setText(koboToNairaInput(valueKobo));
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">₦</span>
        <Input
          id={id}
          inputMode="decimal"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={invalid || bad}
          className="pl-7 tabular"
          onChange={(e) => {
            setText(e.target.value);
            const kobo = nairaInputToKobo(e.target.value);
            if (Number.isNaN(kobo)) {
              setBad(true);
              return;
            }
            setBad(false);
            onChange(kobo);
          }}
          onBlur={() => {
            const kobo = nairaInputToKobo(text);
            if (kobo !== null && !Number.isNaN(kobo)) setText(koboToNairaInput(kobo));
          }}
        />
      </div>
      {bad ? <p className="text-xs text-destructive">Enter an amount like 85000 or 85,000.50</p> : null}
    </div>
  );
}
