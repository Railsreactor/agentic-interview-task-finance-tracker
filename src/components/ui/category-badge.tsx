import { cn } from "#/lib/utils";


interface CategoryBadgeProps {
  name: string | null;
  color: string | null;
  className?: string;
}

export function CategoryBadge({ name, color, className }: CategoryBadgeProps) {
  if (!name) {
    return <span className={cn("text-xs text-muted-foreground/40", className)}>—</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line/40 px-2 py-0.5 text-xs",
        className,
      )}
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color ?? "#6b7280" }}
      />
      {name}
    </span>
  );
}
