export type ManagerObjective =
  | "bienvenida"
  | "romper_hielo"
  | "reactivar_fan_frio"
  | "ofrecer_extra"
  | "llevar_a_mensual"
  | "renovacion";

export type FanManagerState =
  | "nuevo_curioso"
  | "nuevo_timido"
  | "a_punto_de_caducar"
  | "fan_frio"
  | "vip_comprador";

export type FanTone = "suave" | "intimo" | "picante";

export type FanManagerChipTone = "neutral" | "info" | "success" | "warning" | "danger";

export type FanManagerChip = {
  label: string;
  tone?: FanManagerChipTone;
};
