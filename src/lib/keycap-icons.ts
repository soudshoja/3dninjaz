/**
 * Static keycap-icon catalog for the mixed letter+icon square-keychain product.
 *
 * The 34 designs were extracted from the source 3mf render set (top_N.png →
 * WebP) and human-verified against the phase-25 catalog before committing (see
 * scripts/extract-keycap-icons.ts + 25-02-SUMMARY.md for the top_<N> → id map).
 *
 * Each entry points at a committed asset under public/icons/keycaps/<id>.webp.
 * All 34 are plain, ungrouped catalog entries (D-08).
 */
export type KeycapIcon = { id: string; label: string; imageUrl: string; accentColors?: string[] };

export const KEYCAP_ICONS: KeycapIcon[] = [
  { id: "alien", label: "Alien", imageUrl: "/icons/keycaps/alien.webp" },
  { id: "skull", label: "Skull", imageUrl: "/icons/keycaps/skull.webp" },
  { id: "game-controller", label: "Game Controller", imageUrl: "/icons/keycaps/game-controller.webp" },
  { id: "ninja-face", label: "Ninja Face", imageUrl: "/icons/keycaps/ninja-face.webp" },
  { id: "wifi", label: "Wifi Signal", imageUrl: "/icons/keycaps/wifi.webp" },
  { id: "tennis-ball", label: "Tennis Ball", imageUrl: "/icons/keycaps/tennis-ball.webp" },
  { id: "green-ball", label: "Green Ball", imageUrl: "/icons/keycaps/green-ball.webp" },
  { id: "baseball", label: "Baseball", imageUrl: "/icons/keycaps/baseball.webp" },
  { id: "pixel-heart", label: "Pixel Heart", imageUrl: "/icons/keycaps/pixel-heart.webp" },
  { id: "christmas-tree", label: "Christmas Tree", imageUrl: "/icons/keycaps/christmas-tree.webp" },
  { id: "snowflake", label: "Snowflake", imageUrl: "/icons/keycaps/snowflake.webp" },
  { id: "gift", label: "Gift", imageUrl: "/icons/keycaps/gift.webp" },
  { id: "santa-hat", label: "Santa Hat", imageUrl: "/icons/keycaps/santa-hat.webp" },
  { id: "reindeer", label: "Reindeer", imageUrl: "/icons/keycaps/reindeer.webp" },
  { id: "snowman", label: "Snowman", imageUrl: "/icons/keycaps/snowman.webp" },
  { id: "bell", label: "Bell", imageUrl: "/icons/keycaps/bell.webp" },
  { id: "stocking", label: "Stocking", imageUrl: "/icons/keycaps/stocking.webp" },
  { id: "holly-wreath", label: "Holly Wreath", imageUrl: "/icons/keycaps/holly-wreath.webp" },
  { id: "hazard", label: "Hazard", imageUrl: "/icons/keycaps/hazard.webp" },
  { id: "captain-america", label: "Captain America", imageUrl: "/icons/keycaps/captain-america.webp" },
  { id: "spider-man", label: "Spider-Man", imageUrl: "/icons/keycaps/spider-man.webp" },
  { id: "iron-man", label: "Iron Man", imageUrl: "/icons/keycaps/iron-man.webp" },
  { id: "avengers", label: "Avengers", imageUrl: "/icons/keycaps/avengers.webp" },
  { id: "black-panther", label: "Black Panther", imageUrl: "/icons/keycaps/black-panther.webp" },
  { id: "wonder-woman", label: "Wonder Woman", imageUrl: "/icons/keycaps/wonder-woman.webp" },
  { id: "superman", label: "Superman", imageUrl: "/icons/keycaps/superman.webp" },
  { id: "batman", label: "Batman", imageUrl: "/icons/keycaps/batman.webp" },
  { id: "luigi", label: "Luigi", imageUrl: "/icons/keycaps/luigi.webp" },
  { id: "mario", label: "Mario", imageUrl: "/icons/keycaps/mario.webp" },
  { id: "mario-star", label: "Power Star", imageUrl: "/icons/keycaps/mario-star.webp" },
  { id: "golf-ball", label: "Golf Ball", imageUrl: "/icons/keycaps/golf-ball.webp" },
  { id: "candy-cane", label: "Candy Cane", imageUrl: "/icons/keycaps/candy-cane.webp" },
  { id: "thor-hammer", label: "Thor Hammer", imageUrl: "/icons/keycaps/thor-hammer.webp" },
  { id: "hawkeye", label: "Hawkeye", imageUrl: "/icons/keycaps/hawkeye.webp" },
];

export const KEYCAP_ICON_BY_ID: Record<string, KeycapIcon> = Object.fromEntries(
  KEYCAP_ICONS.map((i) => [i.id, i]),
);
