import dynamic from "next/dynamic";

export const LocationMap = dynamic(() => import("./LocationMapClient"), { ssr: false });
