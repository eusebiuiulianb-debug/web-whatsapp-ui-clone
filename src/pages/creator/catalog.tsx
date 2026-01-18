import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function CreatorCatalogRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    void router.replace("/creator/panel?tab=catalog");
  }, [router]);

  return (
    <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)] flex items-center justify-center px-4">
      <Head>
        <title>Redirigiendo…</title>
      </Head>
      <div className="text-sm text-[color:var(--muted)]">Redirigiendo al Panel…</div>
    </div>
  );
}
