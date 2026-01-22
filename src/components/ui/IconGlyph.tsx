import clsx from "clsx";

export type IconName =
  | "user"
  | "note"
  | "clock"
  | "pin"
  | "link"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "dots"
  | "spark"
  | "smile"
  | "check"
  | "alert"
  | "info"
  | "folder"
  | "globe"
  | "paperclip"
  | "calendar"
  | "inbox"
  | "chart"
  | "edit"
  | "settings"
  | "thumbsUp"
  | "thumbsDown"
  | "lock"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "gift"
  | "coin"
  | "gem"
  | "receipt"
  | "flame"
  | "send"
  | "eye"
  | "eyeOff"
  | "home";

type IconGlyphProps = {
  name: IconName;
  className?: string;
  size?: "sm" | "md";
  title?: string;
  ariaLabel?: string;
  ariaHidden?: boolean;
};

export function IconGlyph({
  name,
  className,
  size = "md",
  title,
  ariaLabel,
  ariaHidden,
}: IconGlyphProps) {
  const sizeClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const label = ariaLabel ?? title;
  const shouldHide = ariaHidden === true || !label;
  const ariaProps = shouldHide
    ? { "aria-hidden": "true" as const }
    : { role: "img", "aria-label": label };

  return (
    <svg
      viewBox="0 0 24 24"
      className={clsx("shrink-0", sizeClass, className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...ariaProps}
    >
      {title ? <title>{title}</title> : null}
      {name === "user" && (
        <>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 19.5c1.8-3.4 5-5 7.5-5s5.7 1.6 7.5 5" />
        </>
      )}
      {name === "note" && (
        <>
          <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </>
      )}
      {name === "clock" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {name === "pin" && (
        <>
          <path d="M9 4h6l1.5 6H7.5L9 4z" />
          <path d="M12 10v10" />
        </>
      )}
      {name === "link" && (
        <>
          <path d="M10.5 13.5l3-3" />
          <path d="M8 16a4 4 0 0 1 0-6l2-2" />
          <path d="M16 8a4 4 0 0 1 0 6l-2 2" />
        </>
      )}
      {name === "chevronDown" && <path d="M6 9l6 6 6-6" />}
      {name === "chevronLeft" && <path d="M15 6l-6 6 6 6" />}
      {name === "chevronRight" && <path d="M9 6l6 6-6 6" />}
      {name === "dots" && (
        <>
          <path d="M12 6h.01" />
          <path d="M12 12h.01" />
          <path d="M12 18h.01" />
        </>
      )}
      {name === "spark" && (
        <>
          <path d="M12 4l1.7 3.9L17.5 9l-3.8 1.7L12 14.5l-1.7-3.8L6.5 9l3.8-1.1L12 4z" />
          <path d="M5 15l.7 1.6L7.3 17l-1.6.7L5 19.3l-.7-1.6L2.7 17l1.6-.4L5 15z" />
        </>
      )}
      {name === "smile" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9 10h.01" />
          <path d="M15 10h.01" />
          <path d="M8.5 14c.9 1 2.2 1.6 3.5 1.6s2.6-.6 3.5-1.6" />
        </>
      )}
      {name === "check" && <path d="M5 13l4 4L19 7" />}
      {name === "alert" && (
        <>
          <path d="M12 3l9 16H3l9-16z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      )}
      {name === "info" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 10v5" />
          <path d="M12 7h.01" />
        </>
      )}
      {name === "folder" && (
        <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z" />
      )}
      {name === "globe" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17" />
          <path d="M12 3.5c2.5 3 2.5 14 0 17" />
          <path d="M12 3.5c-2.5 3-2.5 14 0 17" />
        </>
      )}
      {name === "paperclip" && (
        <path d="M8 12l6-6a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7" />
      )}
      {name === "send" && (
        <>
          <path d="M22 2L11 13" />
          <path d="M22 2L15 22L11 13L2 9L22 2Z" />
        </>
      )}
      {name === "eye" && (
        <>
          <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {name === "eyeOff" && (
        <>
          <path d="M4 4l16 16" />
          <path d="M3 12s4-6 9-6c1.7 0 3.3.5 4.7 1.3" />
          <path d="M21 12s-4 6-9 6c-1.7 0-3.3-.5-4.7-1.3" />
          <path d="M10 10a3 3 0 0 1 4 4" />
        </>
      )}
      {name === "home" && (
        <>
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v9h5v-6h4v6h5v-9" />
        </>
      )}
      {name === "calendar" && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M3 9h18" />
        </>
      )}
      {name === "inbox" && (
        <>
          <path d="M4 4h16l-2 8h-4l-2 3-2-3H6L4 4z" />
          <path d="M4 12h4l2 3h4l2-3h4" />
        </>
      )}
      {name === "chart" && (
        <>
          <path d="M4 19h16" />
          <path d="M6 15l4-4 3 3 5-6" />
        </>
      )}
      {name === "edit" && (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </>
      )}
      {name === "settings" && (
        <>
          <path d="M4 7h16" />
          <path d="M4 17h16" />
          <circle cx="9" cy="7" r="2" />
          <circle cx="15" cy="17" r="2" />
        </>
      )}
      {name === "thumbsUp" && (
        <>
          <path d="M7 11v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-1.6l1-5a2 2 0 0 0-2-2.4H12V7a3 3 0 0 0-6 0v4z" />
          <path d="M5 11H3a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 3 20h2" />
        </>
      )}
      {name === "thumbsDown" && (
        <>
          <path d="M7 13V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 1.6l1 5a2 2 0 0 1-2 2.4H12v4a3 3 0 0 1-6 0v-4z" />
          <path d="M5 13H3a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 3 4h2" />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      )}
      {name === "image" && (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M4 17l4-4 3 3 4-4 5 5" />
        </>
      )}
      {name === "video" && (
        <>
          <rect x="3" y="6" width="14" height="12" rx="2" />
          <path d="M13 10l5-3v10l-5-3z" />
        </>
      )}
      {name === "audio" && (
        <>
          <path d="M5 10v4h3l4 3V7l-4 3H5z" />
          <path d="M16 9a4 4 0 0 1 0 6" />
          <path d="M18 7a7 7 0 0 1 0 10" />
        </>
      )}
      {name === "file" && (
        <>
          <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
        </>
      )}
      {name === "gift" && (
        <>
          <rect x="3" y="8" width="18" height="13" rx="2" />
          <path d="M3 12h18" />
          <path d="M12 8v13" />
          <path d="M7 8c-1.5 0-2.5-1-2.5-2.5S5.5 3 7 3c2 0 3.5 2 5 5" />
          <path d="M17 8c1.5 0 2.5-1 2.5-2.5S18.5 3 17 3c-2 0-3.5 2-5 5" />
        </>
      )}
      {name === "coin" && (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v8" />
          <path d="M9.5 10.5h5" />
          <path d="M9.5 13.5h5" />
        </>
      )}
      {name === "gem" && (
        <>
          <path d="M12 3l7 6-7 12-7-12 7-6z" />
          <path d="M5 9h14" />
        </>
      )}
      {name === "receipt" && (
        <>
          <path d="M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3z" />
          <path d="M9 7h6" />
          <path d="M9 11h6" />
          <path d="M9 15h4" />
        </>
      )}
      {name === "flame" && (
        <>
          <path d="M12 3c2.5 3 4.5 5.5 4.5 8.5A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.5C7.5 8.5 9.5 6 12 3z" />
          <path d="M12 10.5c1.2 1.2 2 2.1 2 3.3a2 2 0 1 1-4 0c0-1.2.8-2.1 2-3.3z" />
        </>
      )}
    </svg>
  );
}
