const MUSCLE_GROUPS = [
    { key: 'biceps', label: 'Biceps', match: ['biceps'] },
    { key: 'triceps', label: 'Triceps', match: ['triceps'] },
    { key: 'dos', label: 'Back', match: ['back', 'latissimus', 'lats'] },
    { key: 'abdos', label: 'Abs', match: ['abdominals', 'obliques', 'rectus'] },
    { key: 'epaules', label: 'Shoulders', match: ['deltoid', 'shoulder'] },
    { key: 'pectoraux', label: 'Chest', match: ['pectoralis', 'chest'] }
];

const TRANSLATION_PRIORITY = [12, 2, 1, 4, 13, 7];
const LANGUAGE_LABELS = {
    12: 'FR',
    2: 'EN',
    1: 'DE',
    4: 'ES',
    13: 'IT',
    7: 'PT'
};

let currentUser = null;
let authMode = 'login'; // 'login' or 'signup'
let muscleCardsState = [];
let dataSourceLabel = 'Local API';
const PERFORMANCE_STORAGE_KEY = 'fitnessPerformanceStats';
let performanceStats = {
    plansGenerated: 0,
    timersCompleted: 0,
    lastUpdated: ''
};
let hiitTimer = {
    running: false,
    intervalId: null,
    workSeconds: 40,
    restSeconds: 20,
    rounds: 6,
    currentRound: 1,
    phase: 'work',
    remainingSeconds: 40,
    initialized: false
};

function getApiBaseUrl() {
    const host = window.location.hostname;
    const port = window.location.port;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';

    // When frontend runs on Live Server (e.g. 5500), Go API runs on 8080.
    if (isLocalHost && port && port !== '8080') {
        return `${window.location.protocol}//${host}:8080`;
    }

    return '';
}

const API_BASE_URL = getApiBaseUrl();

function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
}

async function fetchJson(primaryUrl, fallbackUrl) {
    try {
        const response = await fetch(primaryUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return { data: await response.json(), fromFallback: false };
    } catch (primaryError) {
        if (!fallbackUrl) {
            throw primaryError;
        }

        const fallbackResponse = await fetch(fallbackUrl);
        if (!fallbackResponse.ok) {
            throw new Error(`HTTP ${fallbackResponse.status}`);
        }

        return { data: await fallbackResponse.json(), fromFallback: true };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initDashboard();
    loadMuscleCards();
    initAuth();
});

function initDashboard() {
    const searchInput = document.getElementById('searchMuscle');
    const sideFilter = document.getElementById('sideFilter');
    const randomWorkoutBtn = document.getElementById('randomWorkoutBtn');

    searchInput?.addEventListener('input', applyCardFilters);
    sideFilter?.addEventListener('change', applyCardFilters);
    randomWorkoutBtn?.addEventListener('click', openRandomWorkout);

    document.getElementById('generatePlanBtn')?.addEventListener('click', generateDailyPlan);
    document.getElementById('timerStartBtn')?.addEventListener('click', startHiitTimer);
    document.getElementById('timerPauseBtn')?.addEventListener('click', pauseHiitTimer);
    document.getElementById('timerResetBtn')?.addEventListener('click', resetHiitTimer);
    document.getElementById('resetProgressBtn')?.addEventListener('click', resetPerformanceStats);

    hydratePerformanceStats();
    renderPerformanceStats();
    renderTimer();
}

function initAuth() {
    // Check whether user is already signed in
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token');
    
    if (savedUser && savedToken && savedUser !== 'undefined') {
        try {
            currentUser = JSON.parse(savedUser);
            updateAuthUI();
        } catch (error) {
            console.error('Failed to parse localStorage:', error);
            localStorage.clear();
        }
    }

    // Modal events
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const authModal = document.getElementById('authModal');
    const modalClose = document.querySelector('.modal-close');
    const authForm = document.getElementById('authForm');
    const switchMode = document.getElementById('switchMode');

    loginBtn?.addEventListener('click', () => openAuthModal('login'));
    logoutBtn?.addEventListener('click', logout);
    modalClose?.addEventListener('click', closeAuthModal);
    switchMode?.addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthMode();
    });

    authModal?.addEventListener('click', (e) => {
        if (e.target === authModal) {
            closeAuthModal();
        }
    });

    authForm?.addEventListener('submit', handleAuthSubmit);

    // Toggle password visibility
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    togglePassword?.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        togglePassword.textContent = type === 'password' ? '👁️' : '🙈';
    });
}

function openAuthModal(mode = 'login') {
    authMode = mode;
    updateModalUI();
    document.getElementById('authModal')?.classList.remove('hidden');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    document.getElementById('authError')?.classList.add('hidden');
}

function closeAuthModal() {
    document.getElementById('authModal')?.classList.add('hidden');
}

function toggleAuthMode() {
    authMode = authMode === 'login' ? 'signup' : 'login';
    updateModalUI();
}

function updateModalUI() {
    const modalTitle = document.getElementById('modalTitle');
    const submitBtn = document.querySelector('#authForm button[type="submit"]');
    const switchText = document.getElementById('switchText');
    const switchMode = document.getElementById('switchMode');

    if (authMode === 'login') {
        modalTitle.textContent = 'Login';
        submitBtn.textContent = 'Sign in';
        switchText.textContent = 'No account yet?';
        switchMode.textContent = 'Sign up';
    } else {
        modalTitle.textContent = 'Sign up';
        submitBtn.textContent = 'Create account';
        switchText.textContent = 'Already have an account?';
        switchMode.textContent = 'Sign in';
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('authError');

    try {
        const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
        const response = await fetch(apiUrl(endpoint), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.msg || 'Authentication error');
        }

        // Save user info
        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.access_token);

        updateAuthUI();
        closeAuthModal();
        
        if (authMode === 'signup') {
            alert('Sign up successful. You are now logged in.');
        }
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    updateAuthUI();
}

function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const userEmail = document.getElementById('userEmail');

    if (currentUser) {
        loginBtn?.classList.add('hidden');
        userInfo?.classList.remove('hidden');
        userEmail.textContent = currentUser.email || 'User';
    } else {
        loginBtn?.classList.remove('hidden');
        userInfo?.classList.add('hidden');
    }
}

async function loadMuscleCards() {
    const container = document.getElementById('muscleCards');
    if (!container) {
        return;
    }

    try {
        const { data, fromFallback } = await fetchJson(
            apiUrl('/api/muscles'),
            'https://wger.de/api/v2/muscle/'
        );

        container.innerHTML = '';
        muscleCardsState = [];
        dataSourceLabel = fromFallback ? 'Wger direct' : 'Local API';

        if (!data.results || data.results.length === 0) {
            container.innerHTML = '<p class="loading">No muscles found</p>';
            updateOverviewStats();
            return;
        }

        MUSCLE_GROUPS.forEach(group => {
            const card = document.createElement('div');
            card.className = 'muscle-card';
            card.dataset.key = group.key;

            const muscle = findMuscle(data.results, group.match);
            const muscleId = muscle ? muscle.id : null;
            const imageUrl = muscle && muscle.image_url_main ? `https://wger.de${muscle.image_url_main}` : '';
            const side = getMuscleSide(group.key);
            const imageBlock = `
                <div class="muscle-image-wrap muscle-image-wrap--${side}">
                    ${imageUrl ? `<img class="muscle-image" src="${imageUrl}" alt="${group.label}">` : '<div class="muscle-image-fallback">Image unavailable</div>'}
                </div>
            `;

            card.dataset.image = imageUrl;
            card.dataset.side = side;
            card.dataset.label = group.label;
            card.dataset.available = muscleId ? 'true' : 'false';
            card.dataset.muscleId = muscleId ? String(muscleId) : '';

            card.innerHTML = `
                <div class="muscle-card-header">
                    <h3>${group.label}</h3>
                    <button class="muscle-toggle" type="button" data-expanded="false">View exercises</button>
                </div>
                <p class="muscle-meta">View: ${side === 'back' ? 'Back' : 'Front'}${muscleId ? ' • Available' : ' • Unavailable'}</p>
                ${imageBlock}
                <div class="muscle-exercises hidden">
                    <p class="info">Click "View exercises" to open the list.</p>
                </div>
            `;

            container.appendChild(card);

            const body = card.querySelector('.muscle-exercises');
            const toggle = card.querySelector('.muscle-toggle');

            if (!muscleId) {
                body.classList.remove('hidden');
                body.innerHTML = '<p class="info">Muscle unavailable in API</p>';
                toggle.disabled = true;
            } else {
                toggle.addEventListener('click', () => {
                    toggleMuscleExercises(card, muscleId, card.dataset.image, card.dataset.side, card.dataset.label);
                });
            }

            muscleCardsState.push({
                element: card,
                label: group.label,
                side,
                available: !!muscleId,
                muscleId: muscleId || null,
                imageUrl
            });
        });

        applyCardFilters();
        updateOverviewStats();
    } catch (error) {
        console.error('Failed to load muscles:', error);
        container.innerHTML = '<p class="loading">Failed to load muscles</p>';
        muscleCardsState = [];
        dataSourceLabel = 'Unavailable';
        updateOverviewStats();
    }
}

function updateOverviewStats() {
    const source = document.getElementById('statSource');
    const available = document.getElementById('statAvailable');
    const total = document.getElementById('statTotal');

    const availableCount = muscleCardsState.filter(item => item.available).length;

    if (source) {
        source.textContent = dataSourceLabel;
    }
    if (available) {
        available.textContent = `${availableCount} / ${MUSCLE_GROUPS.length}`;
    }
    if (total) {
        total.textContent = `${MUSCLE_GROUPS.length} groups`;
    }
}

function applyCardFilters() {
    const searchTerm = String(document.getElementById('searchMuscle')?.value || '').trim().toLowerCase();
    const sideValue = document.getElementById('sideFilter')?.value || 'all';
    const noResults = document.getElementById('noResults');

    let visibleCount = 0;

    muscleCardsState.forEach(item => {
        const matchSearch = !searchTerm || item.label.toLowerCase().includes(searchTerm);
        const matchSide = sideValue === 'all' || item.side === sideValue;
        const visible = matchSearch && matchSide;

        item.element.classList.toggle('hidden', !visible);
        if (visible) {
            visibleCount += 1;
        }
    });

    if (noResults) {
        noResults.classList.toggle('hidden', visibleCount > 0);
    }
}

function openRandomWorkout() {
    const availableGroups = muscleCardsState.filter(item => item.available && !item.element.classList.contains('hidden'));
    const pool = availableGroups.length > 0 ? availableGroups : muscleCardsState.filter(item => item.available);

    if (pool.length === 0) {
        alert('No available group to generate a workout.');
        return;
    }

    const randomGroup = pool[Math.floor(Math.random() * pool.length)];
    openExercisesModal(randomGroup.muscleId, randomGroup.imageUrl, randomGroup.side, randomGroup.label);
}

function hydratePerformanceStats() {
    try {
        const raw = localStorage.getItem(PERFORMANCE_STORAGE_KEY);
        if (!raw) {
            return;
        }

        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed) {
            performanceStats = {
                plansGenerated: Number(parsed.plansGenerated) || 0,
                timersCompleted: Number(parsed.timersCompleted) || 0,
                lastUpdated: String(parsed.lastUpdated || '')
            };
        }
    } catch (error) {
        console.error('Unable to read local stats:', error);
    }
}

function persistPerformanceStats() {
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(performanceStats));
}

function markPerformanceUpdate() {
    performanceStats.lastUpdated = new Date().toLocaleString('en-US');
    persistPerformanceStats();
    renderPerformanceStats();
}

function renderPerformanceStats() {
    const plans = document.getElementById('metricPlans');
    const timers = document.getElementById('metricTimers');
    const updated = document.getElementById('metricLastUpdate');

    if (plans) {
        plans.textContent = String(performanceStats.plansGenerated);
    }
    if (timers) {
        timers.textContent = String(performanceStats.timersCompleted);
    }
    if (updated) {
        updated.textContent = performanceStats.lastUpdated || '-';
    }
}

function resetPerformanceStats() {
    performanceStats = {
        plansGenerated: 0,
        timersCompleted: 0,
        lastUpdated: ''
    };
    persistPerformanceStats();
    renderPerformanceStats();
}

function generateDailyPlan() {
    const planList = document.getElementById('planList');
    const planHint = document.getElementById('planHint');

    if (!planList) {
        return;
    }

    const available = muscleCardsState.filter(item => item.available);
    if (available.length === 0) {
        planList.innerHTML = '<li class="info">No available group to generate a plan.</li>';
        return;
    }

    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(4, shuffled.length));

    planList.innerHTML = '';
    selected.forEach((group, index) => {
        const reps = pickRandom(['4 x 8', '4 x 10', '5 x 5', '3 x 12']);
        const rest = pickRandom(['45s', '60s', '75s']);
        const li = document.createElement('li');
        li.className = 'plan-item';
        li.innerHTML = `
            <div>
                <p class="plan-title">Block ${index + 1} - ${group.label}</p>
                <p class="plan-sub">${reps} • Rest ${rest}</p>
            </div>
            <button class="plan-open" type="button" data-muscle-id="${group.muscleId}" data-side="${group.side}" data-label="${group.label}" data-image="${group.imageUrl}">View exercises</button>
        `;
        planList.appendChild(li);
    });

    planList.querySelectorAll('.plan-open').forEach(button => {
        button.addEventListener('click', () => {
            const muscleId = Number(button.getAttribute('data-muscle-id'));
            const side = button.getAttribute('data-side') || 'front';
            const label = button.getAttribute('data-label') || 'Exercises';
            const image = button.getAttribute('data-image') || '';
            openExercisesModal(muscleId, image, side, label);
        });
    });

    if (planHint) {
        planHint.textContent = 'Plan generated. Click a block to open related exercises.';
    }

    performanceStats.plansGenerated += 1;
    markPerformanceUpdate();
}

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function readTimerInputs() {
    const workInput = Number(document.getElementById('workSeconds')?.value || 40);
    const restInput = Number(document.getElementById('restSeconds')?.value || 20);
    const roundsInput = Number(document.getElementById('roundCount')?.value || 6);

    hiitTimer.workSeconds = clamp(workInput, 10, 300);
    hiitTimer.restSeconds = clamp(restInput, 5, 180);
    hiitTimer.rounds = clamp(roundsInput, 1, 20);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function configureHiitTimerFromInputs() {
    readTimerInputs();
    hiitTimer.currentRound = 1;
    hiitTimer.phase = 'work';
    hiitTimer.remainingSeconds = hiitTimer.workSeconds;
    hiitTimer.initialized = true;
    renderTimer();
}

function startHiitTimer() {
    if (hiitTimer.running) {
        return;
    }

    if (!hiitTimer.initialized) {
        configureHiitTimerFromInputs();
    }

    hiitTimer.running = true;
    hiitTimer.intervalId = setInterval(() => {
        hiitTimer.remainingSeconds -= 1;

        if (hiitTimer.remainingSeconds <= 0) {
            advanceHiitPhase();
        }

        renderTimer();
    }, 1000);

    renderTimer();
}

function pauseHiitTimer() {
    if (!hiitTimer.running) {
        return;
    }

    hiitTimer.running = false;
    if (hiitTimer.intervalId) {
        clearInterval(hiitTimer.intervalId);
        hiitTimer.intervalId = null;
    }
    renderTimer();
}

function resetHiitTimer() {
    pauseHiitTimer();
    hiitTimer.initialized = false;
    configureHiitTimerFromInputs();
}

function advanceHiitPhase() {
    if (hiitTimer.phase === 'work') {
        if (hiitTimer.currentRound >= hiitTimer.rounds) {
            finishHiitTimer();
            return;
        }
        hiitTimer.phase = 'rest';
        hiitTimer.remainingSeconds = hiitTimer.restSeconds;
        return;
    }

    hiitTimer.phase = 'work';
    hiitTimer.currentRound += 1;
    hiitTimer.remainingSeconds = hiitTimer.workSeconds;
}

function finishHiitTimer() {
    pauseHiitTimer();
    hiitTimer.phase = 'done';
    hiitTimer.remainingSeconds = 0;
    hiitTimer.initialized = false;
    performanceStats.timersCompleted += 1;
    markPerformanceUpdate();
}

function renderTimer() {
    const phaseEl = document.getElementById('timerPhase');
    const displayEl = document.getElementById('timerDisplay');

    if (!phaseEl || !displayEl) {
        return;
    }

    let phaseText = 'Ready';
    if (hiitTimer.phase === 'work') {
        phaseText = `Work - Round ${hiitTimer.currentRound}/${hiitTimer.rounds}`;
    } else if (hiitTimer.phase === 'rest') {
        phaseText = `Rest - Round ${hiitTimer.currentRound}/${hiitTimer.rounds}`;
    } else if (hiitTimer.phase === 'done') {
        phaseText = 'Session complete';
    }
    if (hiitTimer.running) {
        phaseText += ' • Running';
    }

    phaseEl.textContent = phaseText;
    displayEl.textContent = formatSeconds(hiitTimer.remainingSeconds);
}

function formatSeconds(total) {
    const safe = Math.max(0, Number(total) || 0);
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function findMuscle(muscles, keywords) {
    const lowerKeywords = keywords.map(word => word.toLowerCase());
    for (const muscle of muscles) {
        const name = String(muscle.name || '').toLowerCase();
        const nameEn = String(muscle.name_en || '').toLowerCase();
        if (lowerKeywords.some(word => name.includes(word) || nameEn.includes(word))) {
            return muscle;
        }
    }
    return null;
}

function getMuscleSide(groupKey) {
    if (groupKey === 'dos' || groupKey === 'triceps') {
        return 'back';
    }
    return 'front';
}

function toggleMuscleExercises(card, muscleId, muscleImageUrl, muscleSide, muscleLabel) {
    openExercisesModal(muscleId, muscleImageUrl, muscleSide, muscleLabel);
}

function openExercisesModal(muscleId, muscleImageUrl, muscleSide, muscleLabel) {
    const params = new URLSearchParams({
        muscle: String(muscleId || ''),
        label: String(muscleLabel || 'Exercises'),
        side: String(muscleSide || 'front'),
        image: String(muscleImageUrl || '')
    });
    window.location.href = `exercises.html?${params.toString()}`;
}

async function loadExercisesForCard(muscleId, container, muscleMeta) {
    try {
        const { data } = await fetchJson(
            apiUrl(`/api/exercises?muscle=${muscleId}`),
            `https://wger.de/api/v2/exerciseinfo/?muscles=${encodeURIComponent(muscleId)}&language=2&status=2`
        );

        if (!data.results || data.results.length === 0) {
            container.innerHTML = '<p class="info">No exercises found</p>';
            return;
        }

        const list = document.createElement('ul');
        list.className = 'muscle-list';
        const maxItems = Math.min(data.results.length, 50);
        const items = [];

        for (let i = 0; i < maxItems; i++) {
            const exercise = data.results[i] || {};
            const translation = getPreferredTranslation(exercise);
            if (!translation) {
                continue;
            }

            const name = String(translation.name || '').trim();

            if (!name) {
                continue;
            }

            const description = trimText(stripHtml(String(translation.description || '')), 220);
            const difficulty = estimateDifficulty(exercise);
            const imageBlock = buildExerciseImage(muscleMeta);

            const item = document.createElement('li');
            item.className = 'exercise-item';
            item.innerHTML = `
                <div class="exercise-header">
                    <h4 class="exercise-title">${name}</h4>
                    <div class="exercise-badges">
                        <span class="exercise-language">${translation.label || 'N/A'}</span>
                        <span class="exercise-difficulty">${difficulty}</span>
                    </div>
                </div>
                ${imageBlock}
                <p class="exercise-desc">${description || 'Description unavailable.'}</p>
            `;
            items.push(item);
        }

        if (items.length === 0) {
            container.innerHTML = '<p class="info">No exercises available in supported languages</p>';
            return;
        }

        const initialCount = 5;
        items.forEach((item, index) => {
            if (index >= initialCount) {
                item.classList.add('hidden');
            }
            list.appendChild(item);
        });

        container.innerHTML = '';
        container.appendChild(list);

        if (items.length > initialCount) {
            const button = document.createElement('button');
            button.className = 'see-more-btn';
            button.textContent = 'Show more';
            button.addEventListener('click', () => {
                const isExpanded = button.getAttribute('data-expanded') === 'true';
                list.querySelectorAll('li').forEach((li, index) => {
                    if (index >= initialCount) {
                        li.classList.toggle('hidden', isExpanded);
                    }
                });
                button.textContent = isExpanded ? 'Show more' : 'Show less';
                button.setAttribute('data-expanded', isExpanded ? 'false' : 'true');
            });
            button.setAttribute('data-expanded', 'false');
            container.appendChild(button);
        }
    } catch (error) {
        console.error('Failed to load exercises:', error);
        container.innerHTML = '<p class="loading">Failed to load exercises</p>';
    }
}

function getPreferredTranslation(exercise) {
    if (!Array.isArray(exercise.translations)) {
        return null;
    }

    for (const languageId of TRANSLATION_PRIORITY) {
        const preferred = exercise.translations.find(t => t.language === languageId || t.language_id === languageId);
        if (preferred) {
            return {
                name: preferred.name,
                description: preferred.description,
                languageId,
                label: LANGUAGE_LABELS[languageId] || `ID ${languageId}`
            };
        }
    }

    const fallback = exercise.translations[0];
    if (!fallback) {
        return null;
    }

    const fallbackLanguageId = fallback.language || fallback.language_id || 0;
    return {
        name: fallback.name,
        description: fallback.description,
        languageId: fallbackLanguageId,
        label: LANGUAGE_LABELS[fallbackLanguageId] || 'OTHER'
    };
}

function buildExerciseImage(muscleMeta) {
    const safeMeta = muscleMeta || {};
    const side = safeMeta.muscleSide === 'back' ? 'back' : 'front';
    const label = safeMeta.muscleLabel || 'Exercise';
    const imageUrl = safeMeta.muscleImageUrl || '';

    return `
        <div class="exercise-image-wrap exercise-image-wrap--${side}">
            ${imageUrl ? `<img class="exercise-image" src="${imageUrl}" alt="${label}">` : '<div class="exercise-image-fallback">Illustration unavailable</div>'}
        </div>
    `;
}

function estimateDifficulty(exercise) {
    const equipmentCount = Array.isArray(exercise.equipment) ? exercise.equipment.length : 0;
    if (equipmentCount === 0) {
        return 'Easy';
    }
    if (equipmentCount === 1) {
        return 'Medium';
    }
    return 'Hard';
}

function stripHtml(text) {
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function trimText(text, maxLength) {
    if (!text) {
        return '';
    }
    if (text.length <= maxLength) {
        return text;
    }
    return text.slice(0, maxLength).trim() + '...';
}
