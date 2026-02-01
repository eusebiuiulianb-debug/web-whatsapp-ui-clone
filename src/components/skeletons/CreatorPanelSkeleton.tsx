import { MeSkeleton } from "./MeSkeleton";

type CreatorPanelSkeletonProps = {
  className?: string;
};

export function CreatorPanelSkeleton({ className }: CreatorPanelSkeletonProps) {
  return <MeSkeleton className={className} />;
}
