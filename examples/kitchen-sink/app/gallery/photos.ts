// Colocated non-route data: only page.<ext> / route.<ext> files create
// routes — for Next and for the scanner alike — so plain modules can live in
// the app tree. Emoji stand in for images; the demo is the interception
// wiring, not the pixels.
export interface Photo {
  caption: string;
  emoji: string;
  id: number;
  title: string;
}

export const photos: readonly Photo[] = [
  { caption: "Golden hour over the ridge", emoji: "🌄", id: 1, title: "Ridge" },
  { caption: "Harbor lights at dusk", emoji: "🌉", id: 2, title: "Harbor" },
  { caption: "Fog rolling off the pines", emoji: "🌲", id: 3, title: "Pines" },
  { caption: "Desert bloom after rain", emoji: "🌵", id: 4, title: "Bloom" },
  { caption: "Comet over the observatory", emoji: "☄️", id: 5, title: "Comet" },
  { caption: "Tide pools at low tide", emoji: "🐚", id: 6, title: "Tide" },
];

export function getPhoto(id: number): Photo | undefined {
  return photos.find((photo) => photo.id === id);
}
