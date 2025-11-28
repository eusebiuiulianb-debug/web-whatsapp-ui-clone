import Link from "next/link";

interface CreatorHeaderProps {
  name: string;
  role: string;
  subtitle: string;
  initial: string;
}

export default function CreatorHeader({ name, role, subtitle, initial }: CreatorHeaderProps) {
  return (
    <div className="flex items-center justify-between w-full px-4 py-3 bg-[#111b21] border-y border-[rgba(134,150,160,0.15)]">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#2a3942] text-white font-semibold">
          {initial}
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-white font-medium text-sm">{name} · {role}</span>
          <span className="text-[#8696a0] text-sm">{subtitle}</span>
        </div>
      </div>
      <Link href="/creator" legacyBehavior>
        <a className="text-xs text-[#53bdeb] hover:underline whitespace-nowrap">
          Ver perfil público
        </a>
      </Link>
    </div>
  );
}
