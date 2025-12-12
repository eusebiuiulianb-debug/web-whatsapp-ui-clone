import React from "react";
import clsx from "clsx";

type Density = "comfortable" | "compact";
type FocusMode = "normal" | "solo_chat";

type Props = {
  left?: React.ReactNode;
  main: React.ReactNode;
  right?: React.ReactNode;
  density: Density;
  focus: FocusMode;
};

export function CreatorWorkspaceLayout({ left, main, right, density, focus }: Props) {
  const gap = density === "compact" ? "gap-3" : "gap-4";
  if (focus === "solo_chat") {
    return <div className={clsx("flex min-h-0 flex-col", gap)}>{main}</div>;
  }

  return (
    <div className={clsx("flex min-h-0 flex-col", gap, "lg:grid lg:grid-cols-[240px_minmax(0,1fr)_340px] lg:items-start")}>
      {left && (
        <div className="order-2 min-h-0 lg:order-1">
          <div className="h-full min-h-0">{left}</div>
        </div>
      )}
      <div className="order-1 min-h-0 lg:order-2">
        <div className="h-full min-h-0">{main}</div>
      </div>
      {right && (
        <div className="order-3 min-h-0 lg:order-3">
          <div className="h-full min-h-0">{right}</div>
        </div>
      )}
    </div>
  );
}
