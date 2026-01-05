import "../styles/globals.css";
import type { AppProps } from 'next/app'
import { useEffect } from "react";
import { ConversationProvider } from "../context/ConversationContext";
import { CreatorConfigProvider } from "../context/CreatorConfigContext";
import { initCrossTabEvents } from "../lib/crossTabEvents";

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    initCrossTabEvents();
  }, []);

  return (
    <CreatorConfigProvider>
      <ConversationProvider>
        <Component {...pageProps} />
      </ConversationProvider>
    </CreatorConfigProvider>
  )
}

export default MyApp
