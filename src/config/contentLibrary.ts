type DemoContentType = "photo" | "video" | "combo";

export type DemoContentItem = {
  id: string;
  title: string;
  type: DemoContentType;
};

export type DemoContentPack = {
  packId: "welcome" | "monthly" | "special";
  packLabel: string;
  level: 1 | 2 | 3;
  items: DemoContentItem[];
};

export const demoContentLibrary: DemoContentPack[] = [
  {
    packId: "welcome",
    packLabel: "Pack bienvenida",
    level: 1,
    items: [
      { id: "welcome-photo-1", title: "Bienvenida foto 1", type: "photo" },
      { id: "welcome-video-1", title: "Bienvenida video 1", type: "video" },
      { id: "welcome-combo-1", title: "Checklist inicio (combo)", type: "combo" },
    ],
  },
  {
    packId: "monthly",
    packLabel: "Pack mensual",
    level: 2,
    items: [
      { id: "monthly-photo-1", title: "Sesión mensual foto 1", type: "photo" },
      { id: "monthly-video-1", title: "Sesión mensual video 1", type: "video" },
      { id: "monthly-combo-1", title: "Guía mensual (combo)", type: "combo" },
    ],
  },
  {
    packId: "special",
    packLabel: "Pack especial",
    level: 3,
    items: [
      { id: "special-photo-1", title: "Especial foto 1", type: "photo" },
      { id: "special-video-1", title: "Especial video 1", type: "video" },
      { id: "special-combo-1", title: "Plan especial (combo)", type: "combo" },
    ],
  },
];
