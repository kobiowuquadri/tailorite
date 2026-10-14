"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api";
import { toastError } from "@/lib/form-errors";

/** Confirmation dialog for actions that need a written reason (kept in the order history). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  hint,
  placeholder,
  defaultValue = "",
  minLength = 3,
  maxLength = 1000,
  confirmLabel,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultValue?: string;
  minLength?: number;
  maxLength?: number;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (text: string) => Promise<void>;
  children?: ReactNode;
}) {
  const [text, setText] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Start every opening with a fresh form.
    setWasOpen(open);
    if (open) {
      setText(defaultValue);
      setError(null);
    }
  }

  async function submit() {
    const value = text.trim();
    if (value.length < minLength) {
      setError(minLength <= 1 ? "This is required" : `Write at least ${minLength} characters`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(value);
      onOpenChange(false);
    } catch (err) {
      const fieldMessage = err instanceof ApiError ? Object.values(err.fieldErrors)[0]?.[0] : undefined;
      if (fieldMessage) setError(fieldMessage);
      else toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {children}
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="reason-text">{label}</FieldLabel>
            <Textarea
              id="reason-text"
              rows={4}
              value={text}
              maxLength={maxLength}
              placeholder={placeholder}
              aria-invalid={Boolean(error)}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            {hint ? <FieldDescription>{hint}</FieldDescription> : null}
            <FieldError>{error}</FieldError>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy}>
              {busy ? <Spinner /> : null} {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
