import fs from 'fs';
import path from 'path';

// Read the GENRE_NAMES from the source code (we will do a simple regex extraction or just compile it if we could, but to be safe, let's just parse the typescript file)
const lyricsGeneratorFile = fs.readFileSync(path.join(__dirname, '../src/lib/lyrics-generator/index.ts'), 'utf-8');

// Extract the keys from GENRE_NAMES object
const genreNamesMatch = lyricsGeneratorFile.match(/export const GENRE_NAMES: Record<string, [^>]+> = \{([\s\S]*?)\};/);
if (!genreNamesMatch) {
    console.error("Could not find GENRE_NAMES.");
    process.exit(1);
}

const genreBlock = genreNamesMatch[1];
const genreIds = [...genreBlock.matchAll(/([a-zA-Z0-9-]+):\s*\{/g)].map(m => m[1]);

console.log(`Found ${genreIds.length} genres:`, genreIds.join(', '));

const publicGenresPath = path.join(__dirname, '../public/images/genres');
if (!fs.existsSync(publicGenresPath)) {
    fs.mkdirSync(publicGenresPath, { recursive: true });
}

const existingImages = fs.readdirSync(publicGenresPath)
    .filter(f => f.endsWith('.webp'))
    .map(f => f.replace('.webp', ''));

const missingGenres = genreIds.filter(id => !existingImages.includes(id));

console.log(`Missing ${missingGenres.length} images:`, missingGenres.join(', '));
