type SpinnerSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<SpinnerSize, string> = {
  sm: "h-3 w-3 border-2",
  md: "h-4 w-4 border-2",
  lg: "h-6 w-6 border-[3px]",
};

export function Spinner({ size = "md", className }: { size?: SpinnerSize; className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-emerald-200 border-t-emerald-700 ${SIZE_CLASS[size]}${
        className ? ` ${className}` : ""
      }`}
    />
  );
}
