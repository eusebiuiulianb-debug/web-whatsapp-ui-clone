import dynamic from "next/dynamic";

export const LocationPickerMap = dynamic(() => import("./LocationPickerMapClient"), { ssr: false });
