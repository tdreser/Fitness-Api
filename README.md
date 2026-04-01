# Fitness-Api

Application web fitness avec backend Go et interface HTML/CSS/JS.

Le projet permet de:
- afficher des groupes musculaires depuis l'API Wger
- consulter les exercices par muscle
- utiliser une authentification (Supabase)
- utiliser une traduction avec cache en memoire
- lancer des outils de session (plan du jour, timer HIIT, progression locale)

## Stack technique

- Backend: Go (net/http)
- Frontend: HTML, CSS, JavaScript (vanilla)
- API externe: Wger
- Authentification: Supabase (optionnel en local)
- Traduction: MyMemory puis fallback LibreTranslate

## Structure du projet

- main.go: serveur Go, routes API, static files, auth, traduction
- index.html / style.css / script.js: page principale
- exercises.html / exercises.css / exercises.js: page detail exercices
- render.yaml: configuration de deploiement Render

## Prerequis

- Go 1.25+

## Variables d'environnement

Le serveur lit un fichier .env a la racine (optionnel), puis les variables systeme.

Variables supportees:

- SUPABASE_URL: URL du projet Supabase
- SUPABASE_ANON_KEY: cle publique Supabase
- TRANSLATE_API_URL: endpoint LibreTranslate (defaut: https://libretranslate.com/translate)
- TRANSLATE_API_KEY: cle API LibreTranslate (optionnelle)
- PORT: port du serveur (defaut: 8080)

Exemple .env:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
TRANSLATE_API_URL=https://libretranslate.com/translate
TRANSLATE_API_KEY=
PORT=8080
```

## Installation et lancement local

1. Installer les dependances Go (standard library uniquement, donc rien a ajouter).
2. Configurer .env si tu veux activer auth/traduction personnalisee.
3. Lancer le serveur:

```bash
go run main.go
```

4. Ouvrir l'application:

```text
http://localhost:8080
```

## Endpoints API

- GET /api/muscles
	- retourne les muscles depuis Wger

- GET /api/exercises?muscle={id}
	- retourne les exercices d'un muscle

- POST /api/translate
	- body JSON:

```json
{
	"texts": ["Bench press"],
	"source": "en",
	"target": "fr"
}
```

- POST /api/auth/signup
- POST /api/auth/login
- POST /api/auth/logout

Note: si SUPABASE_URL ou SUPABASE_ANON_KEY manquent, signup/login renvoient une indisponibilite.

## Deploiement Render

Le projet contient un render.yaml avec:
- buildCommand: go build -o main .
- startCommand: ./main

Pense a renseigner les variables d'environnement dans Render (au minimum SUPABASE_URL et SUPABASE_ANON_KEY si auth active).

## Remarques

- Le backend sert aussi les fichiers statiques du frontend.
- CORS est active en mode permissif (*).
- Certaines donnees Wger (images/videos) peuvent varier selon les exercices disponibles.
