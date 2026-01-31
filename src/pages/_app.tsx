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
    const handleStart = (url: string) => console.log("[routeChangeStart]", url);
    const handleComplete = (url: string) => console.log("[routeChangeComplete]", url);
    const handleError = (err: Error, url: string) => console.warn("[routeChangeError]", url, err);
    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleComplete);
    router.events.on("routeChangeError", handleError);
    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleComplete);
      router.events.off("routeChangeError", handleError);
    };
  }, [router.events]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const handleStart = (url: string) => console.log("[routeChangeStart]", url);
    const handleComplete = (url: string) => console.log("[routeChangeComplete]", url);
    const handleError = (err: Error, url: string) => console.warn("[routeChangeError]", url, err);
    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleComplete);
    router.events.on("routeChangeError", handleError);
    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleComplete);
      router.events.off("routeChangeError", handleError);
    };
  }, [router.events]);

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
