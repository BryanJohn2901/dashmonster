"use client";

export function Sk({
  w = "100%",
  h = "8px",
  className = "",
}: {
  w?: string;
  h?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md animate-pulse ${className}`}
      style={{ width: w, height: h, backgroundColor: "var(--dm-border-default)" }}
    />
  );
}
