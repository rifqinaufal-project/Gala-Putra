"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger {...props} />;
}

function PopoverContent({ className, align = "center", sideOffset = 8, ...props }: PopoverPrimitive.Popup.Props & { align?: "start" | "center" | "end"; sideOffset?: number }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-50 outline-none">
        <PopoverPrimitive.Popup
          className={cn("rounded-2xl border border-border bg-popover text-popover-foreground shadow-dropdown outline-none", className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
