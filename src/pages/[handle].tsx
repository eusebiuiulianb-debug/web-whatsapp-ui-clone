import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const handleParam = typeof ctx.params?.handle === "string" ? ctx.params.handle : "";
  const normalized = slugify(handleParam);
  const query = new URLSearchParams();
  Object.entries(ctx.query || {}).forEach(([key, value]) => {
    if (key === "handle") return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === "string" && entry) query.append(key, entry);
      });
      return;
    }
    if (typeof value === "string" && value) query.append(key, value);
  });
  const search = query.toString();
  return {
    redirect: {
      destination: `/c/${normalized || "creator"}${search ? `?${search}` : ""}`,
      permanent: true,
    },
  };
};

export default function LegacyHandleRedirect() {
  return null;
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
