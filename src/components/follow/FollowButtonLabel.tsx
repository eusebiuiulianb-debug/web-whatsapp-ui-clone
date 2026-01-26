import clsx from "clsx";
import { UserCheck, UserPlus } from "lucide-react";

type Props = {
  isFollowing: boolean;
  isPending?: boolean;
  showIcon?: boolean;
  followLabel?: string;
  followingLabel?: string;
  pendingLabel?: string;
  className?: string;
  labelClassName?: string;
  iconClassName?: string;
};

export function FollowButtonLabel({
  isFollowing,
  isPending = false,
  showIcon = false,
  followLabel = "Seguir",
  followingLabel = "Siguiendo",
  pendingLabel = "...",
  className,
  labelClassName,
  iconClassName = "h-4 w-4",
}: Props) {
  if (isPending) {
    return <span className={clsx("inline-flex items-center", className)}>{pendingLabel}</span>;
  }

  const label = isFollowing ? followingLabel : followLabel;

  return (
    <span className={clsx("inline-flex items-center", showIcon && "gap-2", className)}>
      {showIcon ? (
        isFollowing ? (
          <UserCheck className={iconClassName} aria-hidden="true" />
        ) : (
          <UserPlus className={iconClassName} aria-hidden="true" />
        )
      ) : null}
      <span className={labelClassName}>{label}</span>
    </span>
  );
}
