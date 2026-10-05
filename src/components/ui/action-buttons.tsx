import { m } from "#/paraglide/messages";
import { cn } from "#/lib/utils";

interface ActionButtonProps {
  onClick: () => void;
  className?: string;
  "data-testid"?: string;
}

export function EditButton({
  onClick,
  className,
  "data-testid": dataTestId,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-2 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent transition-colors",
        className,
      )}
      data-testid={dataTestId ?? "edit-btn"}
    >
      {m.edit()}
    </button>
  );
}

export function DeleteButton({
  onClick,
  className,
  "data-testid": dataTestId,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-2 rounded-md text-xs font-medium border border-input bg-background hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors",
        className,
      )}
      data-testid={dataTestId ?? "delete-btn"}
    >
      {m.delete()}
    </button>
  );
}
