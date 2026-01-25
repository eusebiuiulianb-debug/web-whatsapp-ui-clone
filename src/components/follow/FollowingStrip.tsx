import Image from "next/image";
import Link from "next/link";
import { HomeSectionCard } from "../home/HomeSectionCard";
import { normalizeImageSrc } from "../../utils/normalizeImageSrc";
import { CtaPill } from "../ui/CtaPill";

export type FollowingCreator = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
};

type FollowingStripProps = {
  items: FollowingCreator[];
  total: number;
  viewAllHref?: string;
};

export function FollowingStrip({ items, total, viewAllHref = "/following" }: FollowingStripProps) {
  const previewItems = items.slice(0, 6);

  if (total <= 0) return null;

  return (
    <HomeSectionCard
      title="Tus seguidos"
      subtitle="Acceso rapido a tus creadores favoritos."
      rightSlot={
        <CtaPill variant="link" asChild className="relative z-20">
          <Link href={viewAllHref}>Ver todos</Link>
        </CtaPill>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {previewItems.map((creator) => {
          const avatarLabel = creator.name?.trim()?.[0]?.toUpperCase() || "C";
          const profileHref = `/c/${encodeURIComponent(creator.handle)}`;
          const chatHref = `/go/${encodeURIComponent(creator.handle)}`;
          return (
            <div
              key={creator.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[color:var(--surface-border)] bg-[color:var(--surface-1)]">
                  {creator.avatarUrl ? (
                    <Image
                      src={normalizeImageSrc(creator.avatarUrl)}
                      alt={creator.name}
                      width={48}
                      height={48}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[color:var(--muted)]">
                      {avatarLabel}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[color:var(--text)]">{creator.name}</div>
                  <div className="truncate text-xs text-[color:var(--muted)]">@{creator.handle}</div>
                </div>
              </div>
              <div className="relative z-20 flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <CtaPill asChild>
                  <Link href={profileHref}>Ver perfil</Link>
                </CtaPill>
                <CtaPill asChild>
                  <Link href={chatHref}>Chat</Link>
                </CtaPill>
              </div>
            </div>
          );
        })}
      </div>
    </HomeSectionCard>
  );
}
