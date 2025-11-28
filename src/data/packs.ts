export interface Pack {
  id: string;
  name: string;
  price: string;
  description: string;
}

export const packs: Pack[] = [
  {
    id: "welcome",
    name: "Pack bienvenida",
    price: "9 €",
    description: "Primer contacto + 3 audios base personalizados."
  },
  {
    id: "monthly",
    name: "Pack mensual",
    price: "25 €",
    description: "Acceso al chat 1:1 y contenido nuevo cada semana."
  },
  {
    id: "special",
    name: "Pack especial",
    price: "49 €",
    description: "Sesión intensiva + material extra para pareja."
  }
];

export default packs;
