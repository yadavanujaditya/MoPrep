const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, '../data.json');
const outputFile = path.join(__dirname, '../questions.csv');

try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    // CSV Header
    const header = ['id', 'year', 'question_text', 'option_A', 'option_B', 'option_C', 'option_D', 'correct_answer', 'explanation', 'tags'];

    const rows = data.map(q => {
        const tags = Array.isArray(q.tags) ? q.tags.join('|') : q.tags;

        // Escape field for CSV (wrap in quotes if contains comma or newline, escape quotes)
        const escape = (field) => {
            if (field === null || field === undefined) return '';
            const str = String(field);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        return [
            q.id,
            q.year,
            escape(q.question_text),
            escape(q.options?.A || ''),
            escape(q.options?.B || ''),
            escape(q.options?.C || ''),
            escape(q.options?.D || ''),
            escape(q.correct_answer),
            escape(q.explanation),
            escape(tags)
        ].join(',');
    });

    const csvContent = [header.join(','), ...rows].join('\n');
    fs.writeFileSync(outputFile, csvContent, 'utf8');

    console.log(`Successfully converted ${data.length} questions to ${outputFile}`);

} catch (err) {
    console.error('Error:', err);
}
