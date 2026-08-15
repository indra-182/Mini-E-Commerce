export function Skeleton({ width = "100%" }: Readonly<{ width?: string }>) {
  return (
    <span
      className="skeleton"
      style={{ display: "block", width }}
      aria-hidden="true"
    />
  );
}
