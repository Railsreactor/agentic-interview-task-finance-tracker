import * as React from "react";

import { cn } from "#/lib/utils";

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({ ...props }: React.ComponentProps<"option">) {
  return <option data-slot="select-item" {...props} />;
}

function SelectGroup({ ...props }: React.ComponentProps<"optgroup">) {
  return <optgroup data-slot="select-group" {...props} />;
}

export { Select, SelectGroup, SelectItem };
