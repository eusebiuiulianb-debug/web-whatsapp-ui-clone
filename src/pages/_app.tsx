import "../styles/globals.css";
import "leaflet/dist/leaflet.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { ConversationProvider } from "../context/ConversationContext";
import { CreatorConfigProvider } from "../context/CreatorConfigContext";
import { initCrossTabEvents } from "../lib/crossTabEvents";
import { RealtimeToastHost } from "../components/creator/RealtimeToastHost";
import { MobileTabBar } from "../components/mobile/MobileTabBar";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const showCreatorToasts = router.pathname === "/" || router.pathname.startsWith("/creator");

  useEffect(() => {
    initCrossTabEvents();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined") return;
    const win = window as typeof window & { __navHistoryPatched?: boolean };
    if (win.__navHistoryPatched) return;
    win.__navHistoryPatched = true;
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    window.history.pushState = function (...args) {
      console.trace("[NAV] pushState called", args);
      return originalPushState.apply(this, args as Parameters<History["pushState"]>);
    };
    window.history.replaceState = function (...args) {
      console.trace("[NAV] replaceState called", args);
      return originalReplaceState.apply(this, args as Parameters<History["replaceState"]>);
    };
  }, []);

  return (
    <CreatorConfigProvider>
      <ConversationProvider>
        <Component {...pageProps} />
        <div className="xl:hidden">
          <MobileTabBar />
        </div>
        {showCreatorToasts && <RealtimeToastHost />}
      </ConversationProvider>
    </CreatorConfigProvider>
  )
}

export default MyApp
