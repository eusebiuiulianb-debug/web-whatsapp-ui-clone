import type { GetServerSideProps } from "next";

export default function InviteRedirectPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ params, req }) => {
  const token = typeof params?.token === "string" ? params.token.trim() : "";
  if (!token) {
    return { notFound: true };
  }

  const baseUrl = getBaseUrl(req);
  if (!baseUrl) {
    return { notFound: true };
  }

  try {
    const res = await fetch(`${baseUrl}/api/invite/${encodeURIComponent(token)}`);
    if (!res.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[invite] resolve failed", res.status);
      }
      return { notFound: true };
    }
    const data = await res.json();
    const fanId = typeof data?.fanId === "string" ? data.fanId : "";
    if (!fanId) {
      return { notFound: true };
    }
    return {
      redirect: {
        destination: `/fan/${fanId}?invite=1`,
        permanent: false,
      },
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[invite] redirect error", error);
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
