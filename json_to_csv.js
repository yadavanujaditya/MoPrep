const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data.json');
const outputPath = path.join(__dirname, 'converted_data.csv');

if (!fs.existsSync(dataPath)) {
    console.error('Error: data.json not found');
    process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Flatten any nested arrays (important for corrupted/merged JSON)
const flattenData = (input) => {
    let result = [];
    if (Array.isArray(input)) {
        input.forEach(item => {
            result = result.concat(flattenData(item));
        });
    } else if (input && typeof input === 'object') {
        result.push(input);
    }
    return result;
};

const data = flattenData(rawData);

const escapeCSV = (text) => {
    if (text === null || text === undefined) return '';
    const str = String(text);
    return `"${str.replace(/"/g, '""')}"`;
};

// --- Smart Option Extractor ---
function extractOptionsFromExplanation(explanation) {
    if (!explanation || typeof explanation !== 'string') return {};
    const options = {};

    // Pattern to match: "- ✅ a (Text)" or "- ❌ b Text" or "- c Text"
    // IMPROVED: Handles various dash characters, optional spaces/emojis, and ensures it's at the start of a line
    const getPattern = (letter) => new RegExp(`^[\\s]*[\\-–—][\\s]*[✅❌]?[\\s]*${letter}[\\s]*[\\\"\\'\\(]*([^\\r\\n|\\)]+)[\\)]?`, 'im');

    ['a', 'b', 'c', 'd'].forEach(letter => {
        const pattern = getPattern(letter);
        const match = explanation.match(pattern);
        if (match && match[1]) {
            // Cut off at common separators to get just the option text
            let text = match[1].split(':')[0].split(' - ')[0].trim();
            options[letter.toUpperCase()] = text;
        }
    });

    return options;
}

const headers = [
    'id', 'year', 'question_text',
    'option_A', 'option_B', 'option_C', 'option_D',
    'correct_answer', 'explanation', 'tags'
];

let extractedCount = 0;

const rows = data.map((q, index) => {
    const questionText = q.question_text || q.questionText || '';
    const correctAnswer = (q.correct_answer || q.correctAnswer || '').toString().trim().toUpperCase();

    // Get options from object (handle both A and a)
    let optA = q.options?.A || q.options?.a || '';
    let optB = q.options?.B || q.options?.b || '';
    let optC = q.options?.C || q.options?.c || '';
    let optD = q.options?.D || q.options?.d || '';

    // If options are STILL empty, use the Smart Fallback
    if (!optA && !optB && q.explanation) {
        const extracted = extractOptionsFromExplanation(q.explanation);
        if (extracted.A || extracted.B) {
            optA = extracted.A || '';
            optB = extracted.B || '';
            optC = extracted.C || '';
            optD = extracted.D || '';
            extractedCount++;
        }
    }

    let tags = '';
    if (Array.isArray(q.tags)) {
        tags = q.tags.join('|');
    } else if (typeof q.tags === 'string') {
        tags = q.tags;
    }

    return [
        q.id || (index + 1),
        q.year || '',
        escapeCSV(questionText),
        escapeCSV(optA),
        escapeCSV(optB),
        escapeCSV(optC),
        escapeCSV(optD),
        escapeCSV(correctAnswer),
        escapeCSV(q.explanation || ''),
        escapeCSV(tags)
    ].join(',');
});

const csvContent = [headers.join(','), ...rows].join('\r\n');
fs.writeFileSync(outputPath, csvContent);
console.log(`✓ CONVERSION COMPLETE: Processed ${data.length} records.`);
console.log(`✓ SMART RECOVERY: Automatically extracted options for ${extractedCount} questions from their explanations.`);
console.log(`✓ Output saved to converted_data.csv`);
