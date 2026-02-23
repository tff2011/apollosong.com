import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node optimize-images.js <input_path> <output_name_without_ext>');
    process.exit(1);
}

const inputPath = args[0];
const outputName = args[1];
const outputDir = path.join(__dirname, '../public/images');
const outputPath = path.join(outputDir, `${outputName}.webp`);

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

sharp(inputPath)
    .webp({ quality: 80 })
    .toFile(outputPath)
    .then(info => {
        console.log(`Optimized: ${inputPath} -> ${outputPath}`);
    })
    .catch(err => {
        console.error('Error optimizing image:', err);
        process.exit(1);
    });
