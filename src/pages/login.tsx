import Head from "next/head";
import Link from "next/link";

export default function LoginPage() {
  return (
    <>
      <Head>
        <title>Inicia sesion</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-0)] text-[color:var(--text)] px-4">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-semibold">Inicia sesion</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Necesitas una cuenta para continuar.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/creator/manager" legacyBehavior passHref>
              <a className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]">
                Ir al panel
              </a>
            </Link>
            <Link href="/explore" legacyBehavior passHref>
              <a className="inline-flex items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)] px-4 py-2 text-xs font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]">
                Volver a explorar
              </a>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
