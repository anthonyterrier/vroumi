// Liste de départ d'enseignes de garages / centres auto (valeurs indicatives,
// importables en un clic dans le catalogue d'un garage utilisateur). L'adresse
// et le téléphone restent à compléter par l'utilisateur.

export type StarterService = {
  name: string;
  brand?: string;
};

export const STARTER_SERVICES: StarterService[] = [
  { name: "Norauto", brand: "Norauto" },
  { name: "Feu Vert", brand: "Feu Vert" },
  { name: "Midas", brand: "Midas" },
  { name: "Speedy", brand: "Speedy" },
  { name: "Euromaster", brand: "Euromaster" },
  { name: "Point S", brand: "Point S" },
  { name: "Roady", brand: "Roady" },
  { name: "Auto Sécurité (contrôle technique)", brand: "Auto Sécurité" },
  { name: "Dekra (contrôle technique)", brand: "Dekra" },
  { name: "Garage du coin", brand: undefined },
];
