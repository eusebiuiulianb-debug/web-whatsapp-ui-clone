import "../styles/globals.css";
import type { AppProps } from 'next/app'
import { ConversationProvider } from "../context/ConversationContext";
import { CreatorConfigProvider } from "../context/CreatorConfigContext";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <CreatorConfigProvider>
      <ConversationProvider>
        <Component {...pageProps} />
      </ConversationProvider>
    </CreatorConfigProvider>
  )
}

export default MyApp
