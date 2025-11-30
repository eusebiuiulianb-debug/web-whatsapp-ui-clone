import Link from "next/link";
import { useState } from "react";

interface CreatorHeaderProps {
  name: string;
  role: string;
  subtitle: string;
  initial: string;
  onOpenSettings: () => void;
}

export default function CreatorHeader({ name, role, subtitle, initial, onOpenSettings }: CreatorHeaderProps) {
  const [ menuOpen, setMenuOpen ] = useState(false);

  return (
    <div className="flex items-center justify-between w-full px-4 py-3 bg-[#111b21] border-y border-[rgba(134,150,160,0.15)] relative">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#2a3942] text-white font-semibold">
          {initial}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-white font-medium text-sm">{name} · {role}</span>
          <span className="text-[#8696a0] text-sm">{subtitle}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/creator" legacyBehavior>
          <a className="text-xs text-[#53bdeb] hover:underline whitespace-nowrap">
            Ver perfil público
          </a>
        </Link>
        <Link href="/library" legacyBehavior>
          <a className="text-xs text-sky-300 hover:underline whitespace-nowrap">
            Biblioteca
          </a>
        </Link>
        <Link href="/creator/edit" legacyBehavior>
          <a className="text-xs text-amber-300 hover:underline whitespace-nowrap">
            Editar perfil
          </a>
        </Link>
        <div className="relative">
          <button
            type="button"
            aria-label="Menú del creador"
            onClick={() => setMenuOpen(!menuOpen)}
            className="cursor-pointer"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" className="text-[#AEBAC1]">
              <path fill="currentColor" d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"></path>
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-[#111b21] border border-[rgba(134,150,160,0.2)] rounded-lg shadow-lg z-30">
              <button
                type="button"
                className="w-full text-left px-4 py-3 text-white hover:bg-[#2a3942] rounded-lg"
                onClick={() => { onOpenSettings(); setMenuOpen(false); }}
              >
                Ajustes del creador
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
