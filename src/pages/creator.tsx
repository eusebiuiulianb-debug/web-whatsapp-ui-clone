import Head from "next/head";
import Link from "next/link";
import { packs } from "../data/packs";

export default function CreatorPage() {
  return (
    <div className="min-h-screen bg-[#0b141a] text-white">
      <Head>
        <title>NOVSY – Perfil público</title>
      </Head>
      <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-[#2a3942] text-white text-3xl font-semibold">
            E
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold">Eusebiu · Creador</h1>
            <p className="text-[#aebac1] text-lg">Chat privado, audios personalizados y contenidos exclusivos para fans.</p>
            <p className="text-[#cfd6db] text-base leading-relaxed">
              Bienvenido a mi espacio en NOVSY. Aquí comparto avances, envío audios personalizados y respondo tus ideas para crear contenido hecho a tu medida.
              Únete para acceder a sesiones 1:1, material exclusivo y priorizar tus pedidos.
            </p>
          </div>
          <Link href="/" legacyBehavior>
            <a className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#53bdeb] text-[#0b141a] font-semibold hover:bg-[#5ec7f5] transition-colors">
              Entrar al chat privado
            </a>
          </Link>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">Packs disponibles</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {packs.map(pack => (
              <div key={pack.id} className="flex flex-col gap-2 bg-[#111b21] border border-[rgba(134,150,160,0.2)] rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{pack.name}</h3>
                  <span className="text-[#53bdeb] font-semibold">{pack.price}</span>
                </div>
                <p className="text-[#aebac1] text-sm leading-relaxed">{pack.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
