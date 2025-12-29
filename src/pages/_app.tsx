import "../styles/globals.css";
import type { AppProps } from 'next/app'
import { useRouter } from "next/router";
import { ConversationProvider } from "../context/ConversationContext";
import { CreatorConfigProvider } from "../context/CreatorConfigContext";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isFanRoute = router.pathname.startsWith("/fan") || router.pathname.startsWith("/i");
  const content = <Component {...pageProps} />;

  return (
    <CreatorConfigProvider>
      {isFanRoute ? content : <ConversationProvider>{content}</ConversationProvider>}
    </CreatorConfigProvider>
  )
}

export default MyApp
