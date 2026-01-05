import type { GetServerSideProps } from "next";
import FanChatPage, { type FanChatPageProps } from "../fan/[fanId]";
import { buildFanChatProps } from "../../lib/fanChatProps";
import { setFanCookieForHandle } from "../../lib/fanEntry";

type InviteChatProps = FanChatPageProps & {
  fanIdOverride: string;
  inviteOverride: boolean;
};

export default function InviteChatPage(props: InviteChatProps) {
  return <FanChatPage {...props} />;
}

export const getServerSideProps: GetServerSideProps<InviteChatProps> = async ({ params, req, res }) => {
  const token = typeof params?.token === "string" ? params.token.trim() : "";
  if (!token) {
    return { notFound: true };
  }

  const baseUrl = getBaseUrl(req);
  if (!baseUrl) {
    return { notFound: true };
  }

  try {
    const inviteRes = await fetch(`${baseUrl}/api/invite/${encodeURIComponent(token)}`);
    if (!inviteRes.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[invite] resolve failed", inviteRes.status);
      }
      return { notFound: true };
    }
    const data = await inviteRes.json();
    const fanId = typeof data?.fanId === "string" ? data.fanId : "";
    const creatorHandle = typeof data?.creatorHandle === "string" ? data.creatorHandle : "";
    const initialMessages = Array.isArray(data?.messages)
      ? data.messages
      : Array.isArray(data?.items)
      ? data.items
      : [];
    if (!fanId) {
      return { notFound: true };
    }
    const fanProps = await buildFanChatProps(fanId);
    if (creatorHandle) {
      setFanCookieForHandle(res, creatorHandle, fanId);
    }
    return {
      props: {
        ...fanProps,
        fanIdOverride: fanId,
        inviteOverride: true,
        forceAccessRefresh: true,
        initialMessages,
      },
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[invite] resolve error", error);
    }
    return { notFound: true };
  }
};

function getBaseUrl(req: { headers: { host?: string; ["x-forwarded-proto"]?: string | string[] } }): string | null {
  const host = req.headers.host;
  if (!host) return null;
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const scheme = proto || "http";
  return `${scheme}://${host}`;
}
