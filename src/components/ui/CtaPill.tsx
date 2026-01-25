import clsx from "clsx";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

type CtaVariant = "pillSmall" | "link";

type CtaPillProps = {
  variant?: CtaVariant;
  className?: string;
  asChild?: boolean;
  children: ReactNode;
};

type WithClassName = { className?: string };

const VARIANT_CLASSES: Record<CtaVariant, string> = {
  pillSmall:
    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium !text-white bg-white/10 ring-1 ring-white/10 hover:bg-white/15 backdrop-blur-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:opacity-60 disabled:cursor-not-allowed",
  link: "!text-emerald-200 hover:!text-emerald-100 font-medium underline underline-offset-4",
};

export function CtaPill({ variant = "pillSmall", className, asChild = false, children }: CtaPillProps) {
  const classes = clsx(VARIANT_CLASSES[variant], className);

  if (asChild && isValidElement<WithClassName>(children)) {
    const element = children as ReactElement<WithClassName>;
    return cloneElement(element, { className: clsx(element.props.className, classes) });
  }

  return <span className={classes}>{children}</span>;
}
