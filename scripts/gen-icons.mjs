// Erzeugt PWA-PNG-Icons aus public/icon.svg. Einmalig laufen:
//   node scripts/gen-icons.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(root, "..", "public");
const svg = await readFile(path.join(pub, "icon.svg"));

const targets = [
  { file: "pwa-192x192.png", size: 192 },
  { file: "pwa-512x512.png", size: 512 },
  { file: "pwa-maskable-512x512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const t of targets) {
  await sharp(svg, { density: 384 })
    .resize(t.size, t.size)
    .png()
    .toFile(path.join(pub, t.file));
  console.log("wrote", t.file);
}
