import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

/**
 * Shows server validation errors next to the matching form fields and everything else as a toast.
 * Returns true when at least one field error was applied.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): boolean {
  if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
    let applied = false;
    for (const [key, messages] of Object.entries(error.fieldErrors)) {
      const name = fields.find((f) => key === f || key.startsWith(`${f}.`));
      if (name) {
        setError(name as Path<T>, { type: "server", message: messages[0] });
        applied = true;
      }
    }
    if (applied) return true;
  }
  toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
  return false;
}

export function toastError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
}
