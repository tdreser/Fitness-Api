const MUSCLE_GROUPS = [
    { key: 'biceps', label: 'Biceps', match: ['biceps'] },
    { key: 'triceps', label: 'Triceps', match: ['triceps'] },
    { key: 'dos', label: 'Dos', match: ['back', 'latissimus', 'lats'] },
    { key: 'abdos', label: 'Abdos', match: ['abdominals', 'obliques', 'rectus'] },
    { key: 'epaules', label: 'Épaules', match: ['deltoid', 'shoulder'] },
    { key: 'pectoraux', label: 'Pectoraux', match: ['pectoralis', 'chest'] }
];

let currentUser = null;
let authMode = 'login'; // 'login' ou 'signup'

document.addEventListener('DOMContentLoaded', function() {
    loadMuscleCards();
    initAuth();
});

function initAuth() {
    // Vérifier si l'utilisateur est déjà connecté
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token');
    
    if (savedUser && savedToken && savedUser !== 'undefined') {
        try {
            currentUser = JSON.parse(savedUser);
            updateAuthUI();
        } catch (error) {
            console.error('Erreur de parsing localStorage:', error);
            localStorage.clear();
        }
    }

    // Événements du modal
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
        modalTitle.textContent = 'Connexion';
        submitBtn.textContent = 'Se connecter';
        switchText.textContent = 'Pas de compte ?';
        switchMode.textContent = "S'inscrire";
    } else {
        modalTitle.textContent = 'Inscription';
        submitBtn.textContent = "S'inscrire";
        switchText.textContent = 'Déjà un compte ?';
        switchMode.textContent = 'Se connecter';
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('authError');

    try {
        const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.msg || "Erreur d'authentification");
        }

        // Sauvegarder les infos utilisateur
        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.access_token);

        updateAuthUI();
        closeAuthModal();
        
        if (authMode === 'signup') {
            alert('Inscription réussie ! Vous êtes maintenant connecté.');
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
        userEmail.textContent = currentUser.email || 'Utilisateur';
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
        const response = await fetch('/api/muscles');
        const data = await response.json();

        container.innerHTML = '';

        if (!data.results || data.results.length === 0) {
            container.innerHTML = '<p class="loading">Aucun muscle trouvé</p>';
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
                    ${imageUrl ? `<img class="muscle-image" src="${imageUrl}" alt="${group.label}">` : '<div class="muscle-image-fallback">Image indisponible</div>'}
                </div>
            `;

            card.dataset.image = imageUrl;
            card.dataset.side = side;
            card.dataset.label = group.label;

            card.innerHTML = `
                <div class="muscle-card-header">
                    <h3>${group.label}</h3>
                    <button class="muscle-toggle" type="button" data-expanded="false">Voir exercices</button>
                </div>
                ${imageBlock}
                <div class="muscle-exercises hidden">
                    <p class="info">Cliquez sur "Voir exercices" pour afficher la liste.</p>
                </div>
            `;

            container.appendChild(card);

            const body = card.querySelector('.muscle-exercises');
            const toggle = card.querySelector('.muscle-toggle');

            if (!muscleId) {
                body.classList.remove('hidden');
                body.innerHTML = '<p class="info">Muscle indisponible dans l\'API</p>';
                toggle.disabled = true;
            } else {
                toggle.addEventListener('click', () => {
                    toggleMuscleExercises(card, muscleId, card.dataset.image, card.dataset.side, card.dataset.label);
                });
            }
        });
    } catch (error) {
        console.error('Erreur lors du chargement des muscles:', error);
        container.innerHTML = '<p class="loading">Erreur lors du chargement des muscles</p>';
    }
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
    const body = card.querySelector('.muscle-exercises');
    const toggle = card.querySelector('.muscle-toggle');
    const isExpanded = toggle.getAttribute('data-expanded') === 'true';

    if (isExpanded) {
        body.classList.add('hidden');
        toggle.textContent = 'Voir exercices';
        toggle.setAttribute('data-expanded', 'false');
        return;
    }

    body.classList.remove('hidden');
    toggle.textContent = 'Masquer';
    toggle.setAttribute('data-expanded', 'true');

    if (!body.dataset.loaded) {
        body.innerHTML = '<p class="loading">Chargement des exercices...</p>';
        loadExercisesForCard(muscleId, body, { muscleImageUrl, muscleSide, muscleLabel }).then(() => {
            body.dataset.loaded = 'true';
        });
    }
}

async function loadExercisesForCard(muscleId, container, muscleMeta) {
    try {
        const response = await fetch(`/api/exercises?muscle=${muscleId}`);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            container.innerHTML = '<p class="info">Aucun exercice trouvé</p>';
            return;
        }

        const list = document.createElement('ul');
        list.className = 'muscle-list';
        const maxItems = Math.min(data.results.length, 50);
        const items = [];

        for (let i = 0; i < maxItems; i++) {
            const exercise = data.results[i] || {};
            const translation = getEnglishTranslation(exercise, 2);
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
                    <span class="exercise-difficulty">${difficulty}</span>
                </div>
                ${imageBlock}
                <p class="exercise-desc">${description || 'Description indisponible.'}</p>
            `;
            items.push(item);
        }

        if (items.length === 0) {
            container.innerHTML = '<p class="info">Aucun exercice disponible en anglais</p>';
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
            button.textContent = 'Voir plus';
            button.addEventListener('click', () => {
                const isExpanded = button.getAttribute('data-expanded') === 'true';
                list.querySelectorAll('li').forEach((li, index) => {
                    if (index >= initialCount) {
                        li.classList.toggle('hidden', isExpanded);
                    }
                });
                button.textContent = isExpanded ? 'Voir plus' : 'Voir moins';
                button.setAttribute('data-expanded', isExpanded ? 'false' : 'true');
            });
            button.setAttribute('data-expanded', 'false');
            container.appendChild(button);
        }
    } catch (error) {
        console.error('Erreur lors du chargement des exercices:', error);
        container.innerHTML = '<p class="loading">Erreur lors du chargement des exercices</p>';
    }
}

function getEnglishTranslation(exercise, languageId) {
    if (!Array.isArray(exercise.translations)) {
        return null;
    }

    const preferred = exercise.translations.find(t => t.language === languageId || t.language_id === languageId);
    if (!preferred) {
        return null;
    }

    return { name: preferred.name, description: preferred.description };
}

function buildExerciseImage(muscleMeta) {
    const safeMeta = muscleMeta || {};
    const side = safeMeta.muscleSide === 'back' ? 'back' : 'front';
    const label = safeMeta.muscleLabel || 'Exercice';
    const imageUrl = safeMeta.muscleImageUrl || '';

    return `
        <div class="exercise-image-wrap exercise-image-wrap--${side}">
            ${imageUrl ? `<img class="exercise-image" src="${imageUrl}" alt="${label}">` : '<div class="exercise-image-fallback">Illustration indisponible</div>'}
        </div>
    `;
}

function estimateDifficulty(exercise) {
    const equipmentCount = Array.isArray(exercise.equipment) ? exercise.equipment.length : 0;
    if (equipmentCount === 0) {
        return 'Facile';
    }
    if (equipmentCount === 1) {
        return 'Moyen';
    }
    return 'Difficile';
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
