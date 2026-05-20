import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pdf } from 'pdf-to-img';

const [, , pdfPath, outDir] = process.argv;
if (!pdfPath || !outDir) {
  console.error('Usage: node scripts/convert-deck.mjs <pdfPath> <outDir>');
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const doc = await pdf(pdfPath, { scale: 2 });

let i = 1;
for await (const png of doc) {
  const file = path.join(outDir, `slide-${String(i).padStart(3, '0')}.png`);
  await writeFile(file, png);
  console.log(`wrote ${file}`);
  i += 1;
}

try {
  await unlink(pdfPath);
  console.log(`removed ${pdfPath}`);
} catch {}
console.log(`done: ${i - 1} pages`);
