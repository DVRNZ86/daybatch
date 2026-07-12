// Dev-only icon rasteriser (B4). Renders icons/icon.svg to the PNG set the
// manifest and iOS metas reference. Not part of the app or the test suite —
// run manually when the mark changes: node tests/tools/generate-icons.mjs
// The maskable variant scales the mark to 80% so it clears the maskable
// safe zone (central circle, r = 0.4 × size) on full-bleed Android masks.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const svg = await readFile(ROOT + "icons/icon.svg", "utf8");

// Wrap the mark's shapes (everything except the background rect) in a
// centred scale transform. Assumes the first <rect> is the full-bleed bg.
function scaled(src, factor) {
  const pad = (512 * (1 - factor)) / 2;
  return src
    .replace("<path", `<g transform="translate(${pad},${pad}) scale(${factor})"><path`)
    .replace("</svg>", "</g></svg>");
}

const TARGETS = [
  { file: "icon-192.png", size: 192, svg },
  { file: "icon-512.png", size: 512, svg },
  { file: "maskable-512.png", size: 512, svg: scaled(svg, 0.8) },
  { file: "apple-touch-icon.png", size: 180, svg },
  { file: "favicon-48.png", size: 48, svg },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
for (const t of TARGETS) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<!doctype html><style>*{margin:0}svg{display:block;width:${t.size}px;height:${t.size}px}</style>${t.svg}`
  );
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: t.size, height: t.size } });
  await writeFile(ROOT + "icons/" + t.file, buf);
  console.log("wrote icons/" + t.file);
}
await browser.close();
