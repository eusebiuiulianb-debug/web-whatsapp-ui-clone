import clsx from "clsx";
import { ReactNode, RefObject, useRef } from "react";

type CreatorShellProps = {
  mobileView: "board" | "chat";
  onBackToBoard: () => void;
  sidebar: ReactNode;
  showChat: boolean;
  renderChat: (helpers: { onBackToBoard: () => void }) => ReactNode;
  fallback: ReactNode;
  conversationSectionRef?: RefObject<HTMLDivElement>;
};

export function CreatorShell({
  mobileView,
  onBackToBoard,
  sidebar,
  showChat,
  renderChat,
  fallback,
  conversationSectionRef,
}: CreatorShellProps) {
  const fallbackRef = useRef<HTMLDivElement>(null!);
  const innerRef = conversationSectionRef ?? fallbackRef;

  return (
    <div className="flex justify-center">
      <div className="flex flex-col w-full xl:container min-h-screen overflow-y-auto lg:overflow-hidden">
        <div className="flex flex-col md:flex-row w-full flex-1 min-h-0 lg:h-[100dvh] lg:max-h-[100dvh] xl:py-4">
          <div className={clsx("flex", mobileView === "chat" ? "hidden lg:flex" : "flex")}>
            {sidebar}
          </div>
          <div
            ref={innerRef}
            className={clsx(
              "relative flex flex-col w-full md:w-[70%] bg-[#222E35] flex-1 min-h-0 overflow-hidden",
              mobileView === "board" ? "hidden lg:flex" : "flex"
            )}
          >
            {showChat ? renderChat({ onBackToBoard }) : fallback}
          </div>
        </div>
      </div>
    </div>
  );
}
