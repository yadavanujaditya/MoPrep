document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    const state = {
        years: [],
        questions: [],
        currentQuestionIndex: 0,
        score: 0,
        currentYear: null,
        activeTag: null,
        mode: 'YEAR', // 'YEAR', 'SET', or 'SHUFFLE'
        sessionKey: null // Unique key for localStorage
    };

    // --- Helpers ---
    function getSavedProgress(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (e) {
            console.error("Error parsing progress for key:", key, e);
            localStorage.removeItem(key); // Clear bad data
            return null;
        }
    }

    // --- Elements ---
    const els = {
        mainContent: document.getElementById('main-content'),
        views: {
            home: document.getElementById('home-view'),
            yearSelection: document.getElementById('year-selection-view'),
            quiz: document.getElementById('quiz-view'),
            results: document.getElementById('results-view')
        },
        yearsGrid: document.getElementById('years-grid'),
        themeToggle: document.getElementById('theme-toggle'),
        homeLogo: document.getElementById('home-logo'),
        // Home Menu items
        btnPrevYear: document.getElementById('btn-prev-year'),
        btnProQuiz: document.getElementById('btn-pro-quiz'),
        backToHome: document.getElementById('back-to-home'),
        // Headings
        viewTitle: document.getElementById('view-title'),
        viewDesc: document.getElementById('view-desc'),
        // Quiz Elements
        questionText: document.getElementById('question-text'),
        optionsContainer: document.getElementById('options-container'),
        qYear: document.getElementById('q-year'),
        qCategory: document.getElementById('q-category'),
        progressFill: document.getElementById('progress-fill'),
        questionTracker: document.getElementById('question-tracker'),
        currentScore: document.getElementById('current-score'),
        backBtn: document.getElementById('back-to-years'),
        // Feedback
        feedbackArea: document.getElementById('feedback-area'),
        feedbackText: document.getElementById('feedback-text'),
        explanationText: document.getElementById('explanation-text'),
        nextBtn: document.getElementById('next-btn'),
        // Results
        finalScore: document.getElementById('final-score'),
        totalQuestions: document.getElementById('total-questions'),
        performanceMsg: document.getElementById('performance-msg'),
        retryBtn: document.getElementById('retry-btn'),
        homeBtn: document.getElementById('home-btn')
    };

    // --- Init ---
    init();

    function init() {
        loadYears();
        setupEventListeners();
        checkTheme();
    }

    // --- API Calls ---
    async function loadYears() {
        try {
            const res = await fetch('/api/years');
            const data = await res.json();
            state.years = data;
            // No automatic render here, rendered when mode is selected
        } catch (err) {
            console.error('Failed to load years:', err);
            els.yearsGrid.innerHTML = '<p class="error">Failed to load quizzes. Please try again later.</p>';
        }
    }

    async function loadQuestions(year) {
        try {
            state.mode = 'YEAR';
            state.sessionKey = `progress_year_${year}_${state.activeTag}`;
            const url = `/api/questions/${year}${state.activeTag ? `?tags=${state.activeTag}` : ''}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!data || data.length === 0) {
                alert('No questions found for this selection.');
                return;
            }

            state.questions = data.sort((a, b) => (a.id || 0) - (b.id || 0));
            state.currentYear = year;
            startQuiz();
        } catch (err) {
            console.error('Failed to load questions:', err);
            alert('Error loading questions.');
        }
    }

    async function loadQuestionsByTag(tag, isShuffle = false) {
        try {
            const res = await fetch(`/api/tags/${tag}`);
            const data = await res.json();

            if (!data || data.length === 0) {
                alert('No questions found for this selection.');
                return [];
            }

            if (isShuffle) {
                state.mode = 'SHUFFLE';
                state.sessionKey = `progress_shuffle_${tag}`;

                // Load existing progress if any
                const saved = getSavedProgress(state.sessionKey);

                // If we have saved questions, use them. Otherwise pick 50 random ones.
                if (saved && saved.questions && Array.isArray(saved.questions) && saved.questions.length > 0) {
                    state.questions = saved.questions;
                } else {
                    const shuffled = shuffleArray([...data]);
                    state.questions = shuffled.slice(0, 50);
                }

                startQuiz();
            } else {
                return data.sort((a, b) => (a.id || 0) - (b.id || 0));
            }
        } catch (err) {
            console.error('Failed to load questions by tag:', err);
            return [];
        }
    }

    // --- Logic & Rendering ---
    function selectMode(tag, title, desc, mode = 'YEAR') {
        state.activeTag = tag;
        state.mode = mode;
        els.viewTitle.innerText = title;
        els.viewDesc.innerText = desc;

        if (mode === 'SET') {
            renderSets(tag);
        } else {
            renderYears();
        }
        switchView('yearSelection');
    }

    function renderYears() {
        els.yearsGrid.innerHTML = '';
        state.years.forEach(year => {
            const card = document.createElement('div');
            card.className = 'year-card';

            // Progress check
            const key = `progress_year_${year.year}_${state.activeTag}`;
            const saved = getSavedProgress(key);
            const progressInfo = saved ? `<div class="card-status">Progress: ${saved.index + 1}/${saved.total}</div>` : '';

            card.innerHTML = `
                <div class="year-title">${year.year}</div>
                <div class="year-desc">${year.description || 'Practice Questions'}</div>
                ${progressInfo}
            `;
            card.onclick = () => loadQuestions(year.year);
            els.yearsGrid.appendChild(card);
        });
    }

    async function renderSets(tag) {
        els.yearsGrid.innerHTML = '<div class="loader"></div>';
        const allQuestions = await loadQuestionsByTag(tag);
        els.yearsGrid.innerHTML = '';

        // ADD EXTRA CARD FIRST: Previous Year Shuffle
        const sKey = `progress_shuffle_haryanamo`;
        const sSaved = getSavedProgress(sKey);
        const sStatus = sSaved ? `<div class="card-status">Progress: ${sSaved.index + 1}/${sSaved.total}</div>` : '';

        const shuffleCard = document.createElement('div');
        shuffleCard.className = 'year-card';
        shuffleCard.style.border = '1px solid var(--secondary)';
        shuffleCard.innerHTML = `
            <div class="year-title">🔄 Shuffle</div>
            <div class="year-desc">Random mix of 50 Questions from Past Papers</div>
            ${sStatus}
        `;
        shuffleCard.onclick = () => loadQuestionsByTag('haryanamo', true);
        els.yearsGrid.appendChild(shuffleCard);

        if (!allQuestions || allQuestions.length === 0) {
            // Even if no sets, we still show the shuffle card
            return;
        }

        const setSize = 50;
        const totalSets = Math.ceil(allQuestions.length / setSize);

        for (let i = 0; i < totalSets; i++) {
            const setQuestions = allQuestions.slice(i * setSize, (i + 1) * setSize);
            const key = `progress_set_${tag}_${i}`;
            const saved = getSavedProgress(key);
            const progressInfo = saved ? `<div class="card-status">Progress: ${saved.index + 1}/${saved.total}</div>` : '';

            const card = document.createElement('div');
            card.className = 'year-card';
            card.innerHTML = `
                <div class="year-title">Set ${i + 1}</div>
                <div class="year-desc">Questions ${i * setSize + 1} - ${Math.min((i + 1) * setSize, allQuestions.length)}</div>
                ${progressInfo}
            `;
            card.onclick = () => {
                state.mode = 'SET';
                state.sessionKey = key;
                state.questions = setQuestions;
                startQuiz();
            };
            els.yearsGrid.appendChild(card);
        }
    }

    function startQuiz() {
        if (!state.questions || state.questions.length === 0) {
            alert("No questions available to start the quiz.");
            switchView('home');
            return;
        }

        const saved = getSavedProgress(state.sessionKey);

        if (saved && saved.index < saved.total - 1) {
            const msg = `You have saved progress (${saved.index + 1}/${saved.total}).\n\n- OK to RESUME where you left off.\n- CANCEL to RESET and start a new quiz.`;
            if (confirm(msg)) {
                // Resume
                state.currentQuestionIndex = saved.index;
                state.score = saved.score;
                // If saved has questions (SHUFFLE mode), restore them
                if (saved.questions && Array.isArray(saved.questions)) {
                    state.questions = saved.questions;
                }
            } else {
                // Reset
                state.currentQuestionIndex = 0;
                state.score = 0;
                localStorage.removeItem(state.sessionKey);
                // If we were in shuffle mode, we actually want FRESH questions now
                if (state.mode === 'SHUFFLE') {
                    // We need to re-trigger loadQuestionsByTag to get fresh shuffle?
                    // Or just shuffle the current ones? Let's just shuffle current ones for speed.
                    state.questions = shuffleArray([...state.questions]);
                }
            }
        } else {
            state.currentQuestionIndex = 0;
            state.score = 0;
        }

        els.currentScore.innerText = state.score;
        switchView('quiz');
        renderQuestion();
    }

    function saveProgress() {
        if (!state.sessionKey) return;
        const progress = {
            index: state.currentQuestionIndex,
            score: state.score,
            total: state.questions.length,
            // If in shuffle mode, we must save the specific 50 questions we picked
            questions: state.mode === 'SHUFFLE' ? state.questions : null
        };
        localStorage.setItem(state.sessionKey, JSON.stringify(progress));
    }

    function clearProgress() {
        if (state.sessionKey) {
            localStorage.removeItem(state.sessionKey);
        }
    }

    function renderQuestion() {
        if (!state.questions[state.currentQuestionIndex]) {
            console.error("Question not found at index:", state.currentQuestionIndex);
            showResults();
            return;
        }
        const q = state.questions[state.currentQuestionIndex];

        // Reset UI - PROPERLY hide and clear feedback
        els.feedbackArea.style.display = 'none';
        els.feedbackText.innerText = '';
        els.explanationText.innerText = '';
        els.optionsContainer.innerHTML = '';
        els.nextBtn.onclick = nextQuestion;

        // Content
        els.questionText.innerText = q.question_text || q.questionText;
        const displayYear = (q.year && q.year.toString() !== '0' && q.year.toString() !== '0000') ? q.year : 'Practice Question';
        els.qYear.innerText = displayYear;
        els.qCategory.innerText = (q.tags && q.tags[0]) ? q.tags[0] : 'General';

        // Progress
        const progress = ((state.currentQuestionIndex) / state.questions.length) * 100;
        els.progressFill.style.width = `${progress}%`;
        els.questionTracker.innerText = `${state.currentQuestionIndex + 1} / ${state.questions.length}`;

        // Options
        const options = q.options; // Object like {A: "...", B: "..."}
        Object.keys(options).forEach(key => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerHTML = `<span class="option-letter">${key}</span> ${options[key]}`;
            btn.onclick = () => handleAnswer(key, q.correct_answer || q.correctAnswer, q.explanation);
            els.optionsContainer.appendChild(btn);
        });
    }

    function handleAnswer(selectedKey, correctKey, explanation) {
        // Disable all buttons
        const buttons = els.optionsContainer.querySelectorAll('.option-btn');
        buttons.forEach(btn => btn.disabled = true);

        const isCorrect = selectedKey === correctKey;

        // Highlight logic
        buttons.forEach(btn => {
            const letter = btn.querySelector('.option-letter').innerText;
            if (letter === correctKey) btn.classList.add('correct');
            if (letter === selectedKey && !isCorrect) btn.classList.add('wrong');
        });

        if (isCorrect) {
            state.score++;
            els.currentScore.innerText = state.score;
            els.feedbackText.innerText = 'Correct! 🎉';
            els.feedbackText.style.color = 'var(--secondary)';
        } else {
            els.feedbackText.innerText = `Incorrect. The correct answer is ${correctKey}.`;
            els.feedbackText.style.color = 'var(--danger)';
        }

        els.explanationText.innerText = explanation || 'No explanation available.';
        els.feedbackArea.style.display = 'block';

        // Save progress after answering
        saveProgress();

        // Scroll to feedback (mobile friendly)
        els.feedbackArea.scrollIntoView({ behavior: 'smooth' });
    }

    function nextQuestion() {
        state.currentQuestionIndex++;
        if (state.currentQuestionIndex < state.questions.length) {
            renderQuestion();
        } else {
            showResults();
        }
    }

    function showResults() {
        switchView('results');
        els.finalScore.innerText = state.score;
        els.totalQuestions.innerText = state.questions.length;

        // Clear progress when quiz is finished
        clearProgress();

        const percentage = (state.score / state.questions.length) * 100;
        if (percentage >= 80) els.performanceMsg.innerText = "Outstanding! You're a pro! 🌟";
        else if (percentage >= 50) els.performanceMsg.innerText = "Good job! Keep practicing. 👍";
        else els.performanceMsg.innerText = "Keep studying, you'll get there! 📚";
    }

    // --- Helpers ---
    function switchView(viewName) {
        Object.values(els.views).forEach(el => {
            el.classList.remove('active-view');
            el.classList.add('hidden-view');
        });

        const target = els.views[viewName];
        if (target) {
            target.classList.remove('hidden-view');
            target.classList.add('active-view');
        }
    }

    function setupEventListeners() {
        // Home Menu Navigation
        els.btnPrevYear.onclick = () => selectMode('haryanamo', 'Previous Year Papers', 'Practice with real exam questions from previous years.', 'YEAR');
        els.btnProQuiz.onclick = () => selectMode('practiseset', 'HaryanaMo Pro', 'Challenge yourself with structured practice sets.', 'SET');

        els.backToHome.onclick = () => switchView('home');
        els.homeLogo.onclick = () => switchView('home');

        // Other Nav
        els.backBtn.onclick = () => switchView(state.mode === 'SHUFFLE' ? 'home' : 'yearSelection');
        els.retryBtn.onclick = () => startQuiz();
        els.homeBtn.onclick = () => switchView('home');

        // Add a global clear for debugging/resetting if needed
        const resetProgressBtn = document.createElement('button');
        resetProgressBtn.className = 'secondary-btn';
        resetProgressBtn.innerText = 'Reset All Data';
        resetProgressBtn.style.marginTop = '1rem';
        resetProgressBtn.onclick = () => {
            if (confirm("This will permanently clear ALL your saved progress and scores. Proceed?")) {
                localStorage.clear();
                alert("All progress cleared.");
                location.reload();
            }
        };
        els.views.home.appendChild(resetProgressBtn);

        els.themeToggle.onclick = toggleTheme;
    }

    function toggleTheme() {
        const body = document.body;
        const current = body.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        body.setAttribute('data-theme', next);
        els.themeToggle.innerHTML = next === 'light' ? '<span class="toggle-icon">☀️</span>' : '<span class="toggle-icon">🌙</span>';
    }

    function checkTheme() {
        // Default to dark
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
});
