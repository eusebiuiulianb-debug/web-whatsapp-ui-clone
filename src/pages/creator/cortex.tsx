import type { GetServerSideProps } from "next";
import { AI_ENABLED } from "../../lib/features";

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: AI_ENABLED ? "/creator/manager" : "/creator/chats",
    permanent: false,
  },
});

export default function CreatorCortexRedirect() {
  return null;
}
