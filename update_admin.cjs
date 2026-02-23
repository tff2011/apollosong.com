const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            const original = content;
            // Replacements Admin Wide
            content = content.replace(/bg-\[\#0A0E1A\]/g, 'bg-porcelain');
            content = content.replace(/bg-\[\#060912\]/g, 'bg-white');
            content = content.replace(/bg-slate-\d00\/\d+/g, 'bg-dark/5');
            content = content.replace(/bg-slate-[89]\d0/g, 'bg-white');
            content = content.replace(/border-slate-[78]\d0\/?\d*/g, 'border-dark/10');
            content = content.replace(/text-slate-400/g, 'text-charcoal/60');
            content = content.replace(/text-slate-300/g, 'text-charcoal/70');
            content = content.replace(/text-slate-200/g, 'text-dark/80');
            content = content.replace(/text-white\/80/g, 'text-dark/80');
            // Be careful not to replace text-white inside colored buttons (e.g. bg-blue-600 text-white)
            // I'll leave text-white alone and manually verify or let it be.

            if (content !== original) {
                fs.writeFileSync(fullPath, content);
            }
        }
    }
}

processDir('src/app/admin');
console.log('done admin pages');
