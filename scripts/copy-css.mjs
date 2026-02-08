#!/usr/bin/env node
/**
 * After Vite build, copy the main CSS bundle to dist/site.css
 * so the no-JS edge-rendered pages can link to a stable URL.
 */
import { readdirSync, copyFileSync, existsSync } from "fs";
import { join } from "path";

const distAssets = join(process.cwd(), "dist", "assets");
const distSiteCss = join(process.cwd(), "dist", "site.css");

if (!existsSync(distAssets)) {
  console.warn("copy-css: dist/assets not found, skipping");
  process.exit(0);
}

const files = readdirSync(distAssets);
const css = files.find((f) => f.endsWith(".css"));
if (css) {
  copyFileSync(join(distAssets, css), distSiteCss);
  console.log("copy-css: copied", css, "to dist/site.css");
} else {
  console.warn("copy-css: no CSS file found in dist/assets");
}
