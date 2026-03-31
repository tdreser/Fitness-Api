const TRANSLATION_PRIORITY = [2, 1, 4, 13, 7, 12];
const LANGUAGE_LABELS = {
    12: 'FR',
    2: 'EN',
    1: 'DE',
    4: 'ES',
    13: 'IT',
    7: 'PT'
};

const LANGUAGE_SOURCES = {
    1: 'de',
    2: 'en',
    4: 'es',
    7: 'pt',
    12: 'fr',
    13: 'it'
};

const state = {
    source: 'Local API',
    exercises: [],
    visible: []
};

function getApiBaseUrl() {
    const host = window.location.hostname;
    const port = window.location.port;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';

    if (isLocalHost && port && port !== '8080') {
        return `${window.location.protocol}//${host}:8080`;
    }

    return '';
}

const API_BASE_URL = getApiBaseUrl();

function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
}

async function requestTranslation(texts, source = 'auto', target = 'en') {
    if (!Array.isArray(texts) || texts.length === 0) {
        return [];
    }

    const response = await fetch(apiUrl('/api/translate'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ texts, source, target })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.translations) ? data.translations : [];
}

function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        muscleId: Number(params.get('muscle') || 0),
        label: params.get('label') || 'Exercises',
        side: params.get('side') || 'front',
        image: params.get('image') || ''
    };
}

async function fetchJson(primaryUrl, fallbackUrl) {
    try {
        const response = await fetch(primaryUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return { data: await response.json(), fromFallback: false };
    } catch (error) {
        const response = await fetch(fallbackUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return { data: await response.json(), fromFallback: true };
    }
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

function normalizeForCompare(text) {
    return String(text || '').trim().toLowerCase();
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

function getExerciseImages(exercise) {
    const images = Array.isArray(exercise.images) ? exercise.images : [];
    if (images.length > 0) {
        const isMovementDemo = (img) => {
            const url = String(img?.image || '').toLowerCase();
            const style = String(img?.style || '').trim();
            const isWgerExerciseMedia = url.includes('/media/exercise-images/');
            const isMuscleAtlas = url.includes('/static/images/muscles/');

            if (isMuscleAtlas) {
                return false;
            }

            if (!isWgerExerciseMedia) {
                return false;
            }

            return style === '' || style === '1';
        };

        const movementOnly = images.filter(isMovementDemo);
        if (movementOnly.length === 0) {
            return [];
        }

        const source = movementOnly;
        const sorted = [...source].sort((a, b) => Number(Boolean(b?.is_main)) - Number(Boolean(a?.is_main)));
        const urls = sorted
            .map(img => String(img?.image || '').trim())
            .filter(Boolean)
            .filter((url, index, array) => array.indexOf(url) === index);

        return urls.slice(0, 2);
    }

    return [];
}

function getExerciseVideo(exercise) {
    const videos = Array.isArray(exercise.videos) ? exercise.videos : [];
    if (videos.length === 0) {
        return '';
    }

    const preferred = [...videos].sort((a, b) => Number(Boolean(b?.is_main)) - Number(Boolean(a?.is_main)));
    const url = String(preferred[0]?.video || '').trim();
    if (!url) {
        return '';
    }

    return url;
}

function setupHeader(meta) {
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    const image = document.getElementById('heroImage');
    const imageFallback = document.getElementById('heroImageFallback');
    const imageWrap = document.getElementById('heroImageWrap');

    title.textContent = meta.label;
    subtitle.textContent = `Target muscle: ${meta.label} • View ${meta.side === 'back' ? 'back' : 'front'}`;

    imageWrap.classList.toggle('hero-image-wrap--back', meta.side === 'back');

    if (meta.image) {
        image.src = meta.image;
        image.classList.remove('hidden');
        imageFallback.classList.add('hidden');
    } else {
        image.classList.add('hidden');
        imageFallback.classList.remove('hidden');
    }
}

function setupActions() {
    const backBtn = document.getElementById('backBtn');
    const search = document.getElementById('exerciseSearch');
    const difficulty = document.getElementById('difficultyFilter');
    const frenchOnly = document.getElementById('frenchOnly');

    backBtn?.addEventListener('click', () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        window.location.href = 'index.html';
    });

    search?.addEventListener('input', applyFilters);
    difficulty?.addEventListener('change', applyFilters);
    frenchOnly?.addEventListener('change', applyFilters);
}

async function loadExercises(meta) {
    const grid = document.getElementById('exerciseGrid');

    if (!meta.muscleId) {
        grid.innerHTML = '<li class="info">Invalid muscle. Go back to the main page.</li>';
        return;
    }

    try {
        const { data, fromFallback } = await fetchJson(
            apiUrl(`/api/exercises?muscle=${meta.muscleId}`),
            `https://wger.de/api/v2/exerciseinfo/?muscles=${encodeURIComponent(meta.muscleId)}&language=2&status=2`
        );

        state.source = fromFallback ? 'Wger direct' : 'Local API';
        state.exercises = mapExercises(data.results || [], meta);
        await autoTranslateExercisesToEnglish();
        applyFilters();
        renderStats();
    } catch (error) {
        console.error('Failed to load exercises:', error);
        grid.innerHTML = '<li class="loading">Failed to load exercises.</li>';
        state.exercises = [];
        state.visible = [];
        state.source = 'Unavailable';
        renderStats();
    }
}

function mapExercises(rawResults, meta) {
    const items = [];
    const maxItems = Math.min(rawResults.length, 100);

    for (let i = 0; i < maxItems; i++) {
        const exercise = rawResults[i] || {};
        const translation = getPreferredTranslation(exercise);

        if (!translation || !translation.name) {
            continue;
        }

        const cleanDescription = trimText(stripHtml(String(translation.description || '')), 260);
        if (!cleanDescription) {
            continue;
        }

        const movementImages = getExerciseImages(exercise);
        const movementVideo = getExerciseVideo(exercise);
        if (movementImages.length === 0 && !movementVideo) {
            continue;
        }

        items.push({
            name: String(translation.name).trim(),
            description: cleanDescription,
            difficulty: estimateDifficulty(exercise),
            language: translation.label,
            languageId: translation.languageId,
            originalLanguage: translation.label,
            autoTranslated: false,
            side: meta.side,
            images: movementImages,
            video: movementVideo,
            label: meta.label
        });
    }

    return items;
}

async function autoTranslateExercisesToEnglish() {
    const toTranslate = state.exercises.filter(item => item.languageId !== 2);
    if (toTranslate.length === 0) {
        return;
    }

    const groups = new Map();
    toTranslate.forEach(item => {
        const source = LANGUAGE_SOURCES[item.languageId] || 'en';
        if (!groups.has(source)) {
            groups.set(source, []);
        }
        groups.get(source).push(item);
    });

    for (const [source, items] of groups.entries()) {
        const names = items.map(item => item.name);
        const descriptions = items.map(item => item.description);

        try {
            const translatedNames = await requestTranslation(names, source, 'en');
            const translatedDescriptions = await requestTranslation(descriptions, source, 'en');

            items.forEach((item, i) => {
                const originalName = item.name;
                const originalDescription = item.description;
                const newName = String(translatedNames[i] || '').trim();
                const newDescription = String(translatedDescriptions[i] || '').trim();

                let hasRealTranslation = false;

                if (newName) {
                    if (normalizeForCompare(newName) !== normalizeForCompare(originalName)) {
                        hasRealTranslation = true;
                    }
                    item.name = newName;
                }
                if (newDescription) {
                    if (normalizeForCompare(newDescription) !== normalizeForCompare(originalDescription)) {
                        hasRealTranslation = true;
                    }
                    item.description = trimText(newDescription, 260);
                }

                if (hasRealTranslation) {
                    item.language = 'EN auto';
                    item.languageId = 2;
                    item.autoTranslated = true;
                }
            });
        } catch (error) {
            console.error(`Auto translation unavailable for ${source}:`, error);
        }
    }
}

function applyFilters() {
    const search = String(document.getElementById('exerciseSearch')?.value || '').trim().toLowerCase();
    const difficulty = document.getElementById('difficultyFilter')?.value || 'all';
    const englishOnly = !!document.getElementById('frenchOnly')?.checked;

    state.visible = state.exercises.filter(item => {
        const matchSearch = !search || item.name.toLowerCase().includes(search) || item.description.toLowerCase().includes(search);
        const matchDifficulty = difficulty === 'all' || item.difficulty === difficulty;
        const matchLanguage = !englishOnly || item.languageId === 2;
        return matchSearch && matchDifficulty && matchLanguage;
    });

    renderExerciseGrid();
    renderStats();
}

function renderExerciseGrid() {
    const grid = document.getElementById('exerciseGrid');
    const emptyState = document.getElementById('emptyState');

    grid.innerHTML = '';

    if (state.visible.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    state.visible.forEach(item => {
        const li = document.createElement('li');
        li.className = 'exercise-item';
        const movementImages = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
        const hasVideo = !!String(item.video || '').trim();
        const hasImage = movementImages.length > 0 || hasVideo;
        const mediaCountClass = movementImages.length >= 2 ? 'exercise-image-wrap--double' : 'exercise-image-wrap--single';
        const imageClasses = [
            'exercise-image-wrap',
            item.side === 'back' ? 'exercise-image-wrap--back' : '',
            hasImage ? 'exercise-image-wrap--has-image' : '',
            mediaCountClass
        ].filter(Boolean).join(' ');

        let mediaHtml = '<div class="exercise-image-fallback">No movement demo image available for this exercise.</div>';
        if (movementImages.length > 0) {
            mediaHtml = `
                <div class="exercise-steps-grid">
                    ${movementImages.map((imageUrl, index) => `
                        <figure class="exercise-step-card">
                            <img class="exercise-image" src="${imageUrl}" alt="${item.label} movement step ${index + 1}">
                        </figure>
                    `).join('')}
                </div>
            `;
        } else if (hasVideo) {
            mediaHtml = `
                <video class="exercise-video" src="${item.video}" autoplay loop muted playsinline controls preload="metadata"></video>
            `;
        }

        li.innerHTML = `
            <div class="exercise-header">
                <h3 class="exercise-title">${item.name}</h3>
                <div class="exercise-badges">
                    <span class="exercise-language${item.autoTranslated ? ' exercise-language-auto' : ''}">${item.language}</span>
                    <span class="exercise-difficulty">${item.difficulty}</span>
                </div>
            </div>
            <div class="${imageClasses}">
                ${mediaHtml}
            </div>
            <p class="exercise-desc">${item.description || 'Description unavailable.'}</p>
        `;
        grid.appendChild(li);
    });
}

function renderStats() {
    const source = document.getElementById('statSource');
    const count = document.getElementById('statCount');

    if (source) {
        source.textContent = state.source;
    }
    if (count) {
        count.textContent = String(state.visible.length);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const meta = getParams();
    setupHeader(meta);
    setupActions();
    loadExercises(meta);
});
