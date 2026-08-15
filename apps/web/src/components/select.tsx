import { useId } from "react";
import type { SelectHTMLAttributes } from "react";

export function Select({
  description,
  error,
  id: providedId,
  label,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  description?: string;
  error?: string;
  label: string;
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [descriptionId, errorId, props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <select
        {...props}
        id={id}
        className={`select-input ${props.className ?? ""}`.trim()}
        aria-describedby={describedBy}
        aria-invalid={error ? true : props["aria-invalid"]}
      />
      {description ? (
        <span className="field-hint" id={descriptionId}>
          {description}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
