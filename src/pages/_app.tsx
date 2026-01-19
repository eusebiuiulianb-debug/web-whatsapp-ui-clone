import "../styles/globals.css";
import "leaflet/dist/leaflet.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { ConversationProvider } from "../context/ConversationContext";
import { CreatorConfigProvider } from "../context/CreatorConfigContext";
import { initCrossTabEvents } from "../lib/crossTabEvents";
import { RealtimeToastHost } from "../components/creator/RealtimeToastHost";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const showCreatorToasts = router.pathname === "/" || router.pathname.startsWith("/creator");

  useEffect(() => {
    initCrossTabEvents();
  }, []);

  return (
    <CreatorConfigProvider>
      <ConversationProvider>
        <Component {...pageProps} />
        {showCreatorToasts && <RealtimeToastHost />}
      </ConversationProvider>
    </CreatorConfigProvider>
  )
}

export default MyApp
