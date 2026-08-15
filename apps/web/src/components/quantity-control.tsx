import { useId } from "react";

import { Button } from "./button";

export function QuantityControl({
  label = "Jumlah",
  max = 99,
  min = 1,
  onChange,
  value,
  disabled = false,
}: Readonly<{
  label?: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  value: number;
  disabled?: boolean;
}>) {
  const labelId = useId();
  const update = (nextValue: number) =>
    onChange(Math.min(max, Math.max(min, nextValue)));

  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className="quantity-control" role="group" aria-labelledby={labelId}>
        <Button
          type="button"
          variant="secondary"
          aria-label={`Kurangi ${label.toLowerCase()}`}
          disabled={disabled || value <= min}
          onClick={() => update(value - 1)}
        >
          −
        </Button>
        <input
          className="quantity-input"
          type="number"
          min={min}
          max={max}
          value={value}
          aria-label={label}
          disabled={disabled}
          onChange={(event) => update(Number(event.target.value) || min)}
        />
        <Button
          type="button"
          variant="secondary"
          aria-label={`Tambah ${label.toLowerCase()}`}
          disabled={disabled || value >= max}
          onClick={() => update(value + 1)}
        >
          +
        </Button>
      </div>
    </div>
  );
}
