import "../styles/globals.css";
import type { AppProps } from 'next/app'
import { useEffect } from "react";
import { ConversationProvider } from "../context/ConversationContext";
import { CreatorConfigProvider } from "../context/CreatorConfigContext";
import { initCrossTabEvents } from "../lib/crossTabEvents";
import { RealtimeToastHost } from "../components/creator/RealtimeToastHost";

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    initCrossTabEvents();
  }, []);

  return (
    <CreatorConfigProvider>
      <ConversationProvider>
        <Component {...pageProps} />
        <RealtimeToastHost />
      </ConversationProvider>
    </CreatorConfigProvider>
  )
}

export default MyApp
