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

// Helper: Fetch and Parse Data
async function getQuestions(forceRefresh = false) {
    const now = Date.now();

    // Return cached data if valid and no forced refresh
    if (!forceRefresh && cachedData && (now - lastFetchTime < CACHE_TTL)) {
        return cachedData;
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

        // Transform to App format
        const transformed = records.map(record => ({
            id: record.id,
            year: parseInt(record.year) || 0,
            question_text: record.question_text,
            options: {
                A: record.option_A,
                B: record.option_B,
                C: record.option_C,
                D: record.option_D
            },
            correct_answer: record.correct_answer,
            explanation: record.explanation,
            tags: record.tags ? record.tags.split('|').map(t => t.trim()).filter(Boolean) : []
        }));

        cachedData = transformed;
        lastFetchTime = now;
        console.log(`Loaded ${transformed.length} questions from Sheets.`);
        return transformed;

    } catch (err) {
        console.error('Error fetching/parsing Sheets data:', err.message);

        // Fallback to local data.json
        try {
            const dataPath = path.join(__dirname, 'data.json');
            if (fs.existsSync(dataPath)) {
                console.log('Falling back to local data.json...');
                const localData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                cachedData = localData;
                lastFetchTime = now; // Mark as "fetched" to avoid immediate retry
                return localData;
            }
        } catch (localErr) {
            console.error('Error reading local data.json:', localErr.message);
        }

        if (cachedData) {
            console.warn('Returning stale cache due to fetch error.');
            return cachedData;
        }
        throw err;
    }
}

// Logs for debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
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
