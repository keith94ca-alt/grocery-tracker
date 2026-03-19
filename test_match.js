// Simple test to check the matching logic
const fs = require('fs');
const path = require('path');

// Read the flipp.ts file
const flippContent = fs.readFileSync(path.join(__dirname, 'lib', 'flipp.ts'), 'utf8');

// Extract the keyWords function
const keyWordsMatch = flippContent.match(/function keyWords\(text: string\): Set<string> \{[\s\S]*?}/);
if (!keyWordsMatch) {
    console.error('Could not find keyWords function');
    process.exit(1);
}

// Create a simplified version for testing
function testKeyWords(text) {
    const noiseWords = new Set(["the", "and", "or", "with", "from", "for", "per", "new", "our", "brand", "store", "gay", "lea"]);
    return new Set(
        text
            .toLowerCase()
            .replace(/\d+(?:\.\d+)?\s*(?:kg|g|lb|lbs|L|mL|oz|pk|pack|ct|count)s?\b/gi, "")
            .split(/[\s,/()&]+/)
            .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !noiseWords.has(w))
    );
}

console.log('Testing keyword extraction:');
console.log('salted butter:', [...testKeyWords('salted butter')]);
console.log('Gay Lea salted butter:', [...testKeyWords('Gay Lea salted butter')]);
console.log('Gay Lea butter salted or unsalted:', [...testKeyWords('Gay Lea butter salted or unsalted')]);

// Test word matching function
function wordMatches(wa, wb) {
    if (wa === wb) return true;
    const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
    return longer.includes(shorter) && shorter.length / longer.length >= 0.8;
}

console.log('\nTesting word matches:');
console.log('gay matches gay:', wordMatches('gay', 'gay'));
console.log('lea matches lea:', wordMatches('lea', 'lea'));
console.log('salted matches salted:', wordMatches('salted', 'salted'));
console.log('butter matches butter:', wordMatches('butter', 'butter'));

// Test fuzzy intersect
function fuzzyIntersect(a, b) {
    return [...a].filter((wa) => [...b].some((wb) => wordMatches(wa, wb))).length;
}

const saltedButterKw = testKeyWords('salted butter');
const gayLeaSaltedButterKw = testKeyWords('Gay Lea salted butter');
const gayLeaButterSaltedUnsaltedKw = testKeyWords('Gay Lea butter salted or unsalted');

console.log('\nTesting fuzzy intersect:');
console.log('salted butter ∩ Gay Lea salted butter:', fuzzyIntersect(saltedButterKw, gayLeaSaltedButterKw));
console.log('salted butter ∩ Gay Lea butter salted or unsalted:', fuzzyIntersect(saltedButterKw, gayLeaButterSaltedUnsaltedKw));

// Test the containment checks
function trackedInFlyer(trackedKw, flippKw) {
    return [...trackedKw].every((tw) => [...flippKw].some((fw) => wordMatches(tw, fw)));
}

function flyerInTracked(flippKw, trackedKw) {
    return [...flippKw].every((fw) => [...trackedKw].some((tw) => wordMatches(fw, tw)));
}

console.log('\nTesting containment:');
console.log('salted butter in Gay Lea salted butter:', trackedInFlyer(saltedButterKw, gayLeaSaltedButterKw));
console.log('Gay Lea salted butter in salted butter:', flyerInTracked(gayLeaSaltedButterKw, saltedButterKw));

console.log('salted butter in Gay Lea butter salted or unsalted:', trackedInFlyer(saltedButterKw, gayLeaButterSaltedUnsaltedKw));
console.log('Gay Lea butter salted or unsalted in salted butter:', flyerInTracked(gayLeaButterSaltedUnsaltedKw, saltedButterKw));

// Test Jaccard similarity
function jaccardSimilarity(a, b) {
    const intersect = fuzzyIntersect(a, b);
    const union = a.size + b.size - intersect;
    return union === 0 ? 0 : intersect / union;
}

console.log('\nTesting Jaccard similarity:');
console.log('salted butter & Gay Lea salted butter:', jaccardSimilarity(saltedButterKw, gayLeaSaltedButterKw));
console.log('salted butter & Gay Lea butter salted or unsalted:', jaccardSimilarity(saltedButterKw, gayLeaButterSaltedUnsaltedKw));

// Test coverage (intersect / flippKw.size)
console.log('\nTesting coverage:');
console.log('salted butter coverage of Gay Lea salted butter:', fuzzyIntersect(saltedButterKw, gayLeaSaltedButterKw) / gayLeaSaltedButterKw.size);
console.log('salted butter coverage of Gay Lea butter salted or unsalted:', fuzzyIntersect(saltedButterKw, gayLeaButterSaltedUnsaltedKw) / gayLeaButterSaltedUnsaltedKw.size);
