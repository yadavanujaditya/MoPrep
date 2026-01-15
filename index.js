const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

const path = require('path');

const app = express();

// Use CORS with no restrictions
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static('public'));

// Google Sheet CSV Publish URL
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS2XBDgArRwbSDeYrFOS4gj3pwWafbCV8_RHGd3v9tb_9S35ApQEzG43pvR6KX-zHaiucsQ0iXClaI0/pub?output=csv';

// Cache configuration
let cachedData = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

const fs = require('fs');
const VISITS_FILE = path.join(__dirname, 'visits.json');

// Initialize visits file if not exists
if (!fs.existsSync(VISITS_FILE)) {
    fs.writeFileSync(VISITS_FILE, JSON.stringify({ total: 0, sessions: 0, lastReset: new Date().toISOString() }));
}

function logVisit() {
    try {
        const data = JSON.parse(fs.readFileSync(VISITS_FILE, 'utf8'));
        data.total += 1;
        fs.writeFileSync(VISITS_FILE, JSON.stringify(data));
    } catch (e) {
        console.error("Error logging visit:", e.message);
    }
}

// Helper: Fetch and Parse Data
async function getQuestions(forceRefresh = false) {
    const now = Date.now();

    // Return cached data if valid and no forced refresh
    if (!forceRefresh && cachedData && (now - lastFetchTime < CACHE_TTL)) {
        return cachedData;
    }

    console.log('Loading base data from data.json...');
    let baseData = [];
    try {
        const dataPath = path.join(__dirname, 'data.json');
        if (fs.existsSync(dataPath)) {
            baseData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
    } catch (e) {
        console.error("Error reading base data.json:", e.message);
    }

    console.log('Fetching fresh data from Google Sheets...');
    try {
        const response = await axios.get(SHEET_CSV_URL);
        const csvData = response.data;

        // Parse CSV
        const records = parse(csvData, {
            columns: true,
            skip_empty_lines: true
        });

        // Transform to App format - be robust with header names
        const sheetQuestions = records.map(record => {
            const getField = (possibleNames) => {
                const key = Object.keys(record).find(k => possibleNames.includes(k.toLowerCase().trim()));
                return key ? record[key] : '';
            };

            return {
                id: getField(['id']),
                year: parseInt(getField(['year'])) || 0,
                question_text: getField(['question_text', 'questiontext']),
                options: {
                    A: getField(['option_a', 'option_A']),
                    B: getField(['option_b', 'option_B']),
                    C: getField(['option_c', 'option_C']),
                    D: getField(['option_d', 'option_D'])
                },
                correct_answer: (getField(['correct_answer', 'correctanswer']) || '').trim().toUpperCase(),
                explanation: getField(['explanation']),
                tags: (getField(['tags']) || '').split('|').map(t => t.trim()).filter(Boolean)
            };
        });

        // Smart Merger: Start with base data, then overwrite/add questions from Sheet
        // Create a map by ID for faster lookup
        const mergedMap = new Map();
        baseData.forEach(q => {
            if (q && q.id !== undefined && q.id !== null) {
                mergedMap.set(q.id.toString(), q);
            }
        });

        sheetQuestions.forEach(sq => {
            if (!sq || sq.id === undefined || sq.id === null || sq.id === '') return;
            const sqId = sq.id.toString();
            const existing = mergedMap.get(sqId);
            if (existing) {
                // Merge: Only overwrite if the sheet has content
                const merged = { ...existing };
                if (sq.question_text) merged.question_text = sq.question_text;
                if (sq.year) merged.year = sq.year;
                if (sq.correct_answer) merged.correct_answer = sq.correct_answer;
                if (sq.explanation) merged.explanation = sq.explanation;
                if (sq.tags && sq.tags.length > 0) merged.tags = sq.tags;

                // Only overwrite options if they are NOT empty in the sheet
                if (sq.options.A) merged.options.A = sq.options.A;
                if (sq.options.B) merged.options.B = sq.options.B;
                if (sq.options.C) merged.options.C = sq.options.C;
                if (sq.options.D) merged.options.D = sq.options.D;

                mergedMap.set(sqId, merged);
            } else {
                // New question from sheet
                mergedMap.set(sqId, sq);
            }
        });

        const mergedList = Array.from(mergedMap.values());
        cachedData = mergedList;
        lastFetchTime = now;
        console.log(`Successfully merged Sheet data. Total questions: ${mergedList.length}`);
        return mergedList;

    } catch (err) {
        console.error('Error fetching/parsing Sheets data:', err.message);
        if (baseData.length > 0) {
            console.log('Using local data.json despite Sheet fetch error.');
            cachedData = baseData;
            lastFetchTime = now;
            return baseData;
        }
        throw err;
    }
}

// Logs for debugging and tracking
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

    // Track visits to the main app or specific assets
    if (req.url === '/' || req.url === '/index.html' || req.url.startsWith('/api/')) {
        logVisit();
    }
    next();
});

// Root route moved to after static to allow index.html to take precedence
// Or just remove it if you want index.html as home.
// app.get('/', ...); // REMOVED to allow public/index.html to serve as home

// Endpoint: Force Refresh Cache
app.post('/api/refresh', async (req, res) => {
    try {
        const data = await getQuestions(true);
        res.json({ success: true, count: data.length, message: 'Data refreshed from Sheets' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to refresh data: ' + err.message });
    }
});

// Get all years
app.get('/api/years', async (req, res) => {
    try {
        const questions = await getQuestions();
        const uniqueYears = [...new Set(questions.map(q => q.year))]
            .filter(year => year && year != 0)
            .sort((a, b) => b - a);

        const years = uniqueYears.map(year => ({
            _id: year.toString(),
            year: year.toString(),
            description: `Quiz Year ${year}`
        }));

        res.json(years);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get questions for a specific year
app.get('/api/questions/:year', async (req, res) => {
    const { tags } = req.query;
    try {
        const questions = await getQuestions();
        let filtered = questions.filter(q => q.year.toString() === req.params.year);

        if (tags) {
            const tagList = tags.split(',').map(t => t.trim().toLowerCase());
            filtered = filtered.filter(q =>
                q.tags && q.tags.some(tag => tagList.some(t => tag.toLowerCase().includes(t)))
            );
        }

        res.json(filtered);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get questions by tag
app.get('/api/tags/:tag', async (req, res) => {
    try {
        const questions = await getQuestions();
        const tagToMatch = req.params.tag.toLowerCase();

        const filtered = questions.filter(q =>
            q.tags && q.tags.some(tag => tag.toLowerCase() === tagToMatch)
        );

        res.json(filtered);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin endpoints (Read-only mode message)
const ADMIN_CREDENTIALS = { username: "admin", password: "password123" };

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        res.json({ success: true, token: `token-${username}` });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

function requireAuth(req, res, next) {
    const token = req.headers['authorization'];
    if (token === `token-${ADMIN_CREDENTIALS.username}`) next();
    else res.status(401).json({ error: 'Unauthorized' });
}

const READ_ONLY_MSG = "Database is now managed via Google Sheets. Is read only mode.";

app.post('/api/admin/verify-json', requireAuth, (req, res) => res.status(400).json({ error: READ_ONLY_MSG }));
app.post('/api/admin/import-json', requireAuth, (req, res) => res.status(400).json({ error: READ_ONLY_MSG }));
app.post('/api/admin/clear-questions', requireAuth, (req, res) => res.status(400).json({ error: READ_ONLY_MSG }));

// Get Visitor Stats
app.get('/api/admin/stats', requireAuth, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(VISITS_FILE, 'utf8'));
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "Failed to load stats" });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n╔════════════════════════════════════╗`);
    console.log(`║    DATA SOURCE: GOOGLE SHEETS      ║`);
    console.log(`╠════════════════════════════════════╣`);
    console.log(`║ Server running on port ${PORT}        ║`);
    console.log(`╚════════════════════════════════════╝\n`);

    await getQuestions().catch(err => console.error("Initial fetch failed:", err.message));
});
