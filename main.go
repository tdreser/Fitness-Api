package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const WGER_API = "https://wger.de/api/v2"

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

var (
	SUPABASE_URL      string
	SUPABASE_ANON_KEY string
	TRANSLATE_API_URL string
	TRANSLATE_API_KEY string
)

var translationCache = struct {
	sync.RWMutex
	Data map[string]string
}{
	Data: make(map[string]string),
}

// Structures pour les réponses de l'API Wger
type MusclesResponse struct {
	Results []Muscle `json:"results"`
}

type Muscle struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type ExercisesResponse struct {
	Results []Exercise `json:"results"`
}

type Exercise struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Muscles     []int  `json:"muscles"`
}

// Récupère les muscles depuis Wger
func getMuscles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	resp, err := http.Get(WGER_API + "/muscle/")
	if err != nil {
		http.Error(w, "Failed to call API", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Read error", http.StatusInternalServerError)
		return
	}

	w.Write(body)
}

// Récupère les exercices pour un muscle spécifique
func getExercises(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	muscleID := r.URL.Query().Get("muscle")
	if muscleID == "" {
		http.Error(w, "Required query param: muscle", http.StatusBadRequest)
		return
	}

	resp, err := http.Get(WGER_API + "/exerciseinfo/?muscles=" + muscleID + "&language=2&status=2")
	if err != nil {
		http.Error(w, "Failed to call API", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Read error", http.StatusInternalServerError)
		return
	}

	w.Write(body)
}

// Structures pour l'authentification
type AuthRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	AccessToken string `json:"access_token"`
	User        interface{} `json:"user"`
}

type TranslateRequest struct {
	Texts  []string `json:"texts"`
	Source string   `json:"source"`
	Target string   `json:"target"`
}

type TranslateResponse struct {
	Translations []string `json:"translations"`
	Provider     string   `json:"provider"`
	Cached       int      `json:"cached"`
}

type libreTranslateResponse struct {
	TranslatedText string `json:"translatedText"`
}

// Signup - Inscription
func signup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if !isAuthConfigured() {
		http.Error(w, "Auth configuration missing on server", http.StatusServiceUnavailable)
		return
	}

	var authReq AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&authReq); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	payload, _ := json.Marshal(authReq)
	req, _ := http.NewRequest("POST", SUPABASE_URL+"/auth/v1/signup", bytes.NewBuffer(payload))
	req.Header.Set("apikey", SUPABASE_ANON_KEY)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Signup failed", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}

// Login - Connexion
func login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if !isAuthConfigured() {
		http.Error(w, "Auth configuration missing on server", http.StatusServiceUnavailable)
		return
	}

	var authReq AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&authReq); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	payload, _ := json.Marshal(authReq)
	req, _ := http.NewRequest("POST", SUPABASE_URL+"/auth/v1/token?grant_type=password", bytes.NewBuffer(payload))
	req.Header.Set("apikey", SUPABASE_ANON_KEY)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Login failed", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}

// Logout - Déconnexion
func logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write([]byte(`{"message":"Successfully logged out"}`))
}

// Traduction automatique avec cache local mémoire
func translateTexts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TranslateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Données invalides", http.StatusBadRequest)
		return
	}

	target := strings.TrimSpace(req.Target)
	if target == "" {
		target = "en"
	}

	source := strings.TrimSpace(req.Source)
	if source == "" {
		source = "auto"
	}

	translations := make([]string, 0, len(req.Texts))
	cachedCount := 0

	for _, rawText := range req.Texts {
		text := strings.TrimSpace(rawText)
		if text == "" {
			translations = append(translations, "")
			continue
		}

		cacheKey := "v2|" + source + "|" + target + "|" + text
		if cached, ok := getCachedTranslation(cacheKey); ok {
			translations = append(translations, cached)
			cachedCount++
			continue
		}

		translated, err := callMyMemoryTranslate(text, source, target)
		if err != nil || strings.TrimSpace(translated) == "" {
			translated, err = callLibreTranslate(text, source, target)
			if err != nil || strings.TrimSpace(translated) == "" {
				// Fallback final: retourne le texte d'origine si les providers échouent.
				translated = text
			}
		}

		if shouldUseLocalEnglishFallback(source, target, text, translated) {
			translated = localEnglishFitnessFallback(text)
		}

		setCachedTranslation(cacheKey, translated)
		translations = append(translations, translated)
	}

	resp := TranslateResponse{
		Translations: translations,
		Provider:     TRANSLATE_API_URL,
		Cached:       cachedCount,
	}

	json.NewEncoder(w).Encode(resp)
}

func getCachedTranslation(key string) (string, bool) {
	translationCache.RLock()
	defer translationCache.RUnlock()
	value, ok := translationCache.Data[key]
	return value, ok
}

func setCachedTranslation(key, value string) {
	translationCache.Lock()
	translationCache.Data[key] = value
	translationCache.Unlock()
}

func callLibreTranslate(text, source, target string) (string, error) {
	payload := map[string]string{
		"q":      text,
		"source": source,
		"target": target,
		"format": "text",
	}

	if TRANSLATE_API_KEY != "" {
		payload["api_key"] = TRANSLATE_API_KEY
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, TRANSLATE_API_URL, bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("translation provider error %d: %s", resp.StatusCode, string(responseBody))
	}

	var translated libreTranslateResponse
	if err := json.NewDecoder(resp.Body).Decode(&translated); err != nil {
		return "", err
	}

	if strings.TrimSpace(translated.TranslatedText) == "" {
		return "", fmt.Errorf("empty translation response")
	}

	return translated.TranslatedText, nil
}

type myMemoryResponse struct {
	ResponseData struct {
		TranslatedText string `json:"translatedText"`
	} `json:"responseData"`
	ResponseStatus interface{} `json:"responseStatus"`
	ResponseDetails string      `json:"responseDetails"`
}

func callMyMemoryTranslate(text, source, target string) (string, error) {
	sl := strings.TrimSpace(strings.ToLower(source))
	if sl == "" || sl == "auto" {
		sl = "en"
	}

	target = strings.TrimSpace(strings.ToLower(target))
	if target == "" {
		target = "en"
	}

	endpoint := fmt.Sprintf(
		"https://api.mymemory.translated.net/get?q=%s&langpair=%s|%s",
		url.QueryEscape(text),
		url.QueryEscape(sl),
		url.QueryEscape(target),
	)

	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Fitness-Api-Translator/1.0")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("translation fallback error %d: %s", resp.StatusCode, string(responseBody))
	}

	var payload myMemoryResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", err
	}

	translated := strings.TrimSpace(payload.ResponseData.TranslatedText)
	if translated == "" {
		return "", fmt.Errorf("empty fallback translation: %s", payload.ResponseDetails)
	}

	return translated, nil
}

func shouldUseLocalEnglishFallback(source, target, original, translated string) bool {
	if strings.TrimSpace(strings.ToLower(target)) != "fr" {
		return false
	}

	if strings.TrimSpace(strings.ToLower(source)) != "en" {
		return false
	}

	return strings.EqualFold(strings.TrimSpace(original), strings.TrimSpace(translated))
}

func localEnglishFitnessFallback(text string) string {
	replacer := strings.NewReplacer(
		"Hold ", "Tenez ",
		"Lower ", "Abaissez ",
		"Lift ", "Levez ",
		"Drive ", "Poussez ",
		"Keep ", "Gardez ",
		"the ", "le ",
		"your ", "vos ",
		"barbell", "barre",
		"dumbbell", "haltere",
		"weight", "poids",
		"shoulder", "epaule",
		"shoulders", "epaules",
		"back", "dos",
		"arms", "bras",
		"arm", "bras",
		"movement", "mouvement",
		"control", "controle",
		"slowly", "lentement",
		"breathe out", "expirez",
		"breathe in", "inspirez",
	)

	return replacer.Replace(text)
}

// Sert les fichiers statiques
func serveStatic(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if path == "/" {
		path = "/index.html"
	}

	filePath := filepath.Join(".", strings.TrimPrefix(path, "/"))
	
	// Vérifie que le fichier existe
	if _, err := os.Stat(filePath); err != nil {
		http.NotFound(w, r)
		return
	}

	// Définit le Content-Type approprié
	if strings.HasSuffix(path, ".css") {
		w.Header().Set("Content-Type", "text/css")
	} else if strings.HasSuffix(path, ".js") {
		w.Header().Set("Content-Type", "application/javascript")
	}

	http.ServeFile(w, r, filePath)
}

// CORS middleware
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next(w, r)
	}
}

func loadEnvFile(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		value = strings.Trim(value, `"'`)

		if key != "" && os.Getenv(key) == "" {
			_ = os.Setenv(key, value)
		}
	}
}

func loadConfig() {
	loadEnvFile(".env")

	SUPABASE_URL = getEnv("SUPABASE_URL", "")
	SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY", "")
	TRANSLATE_API_URL = getEnv("TRANSLATE_API_URL", "https://libretranslate.com/translate")
	TRANSLATE_API_KEY = getEnv("TRANSLATE_API_KEY", "")
}

func isAuthConfigured() bool {
	return SUPABASE_URL != "" && SUPABASE_ANON_KEY != ""
}

func main() {
	loadConfig()
	if !isAuthConfigured() {
		fmt.Println("Warning: SUPABASE_URL or SUPABASE_ANON_KEY missing. Auth endpoints will be unavailable until .env is configured.")
	}

	http.HandleFunc("/api/muscles", enableCORS(getMuscles))
	http.HandleFunc("/api/exercises", enableCORS(getExercises))
	http.HandleFunc("/api/translate", enableCORS(translateTexts))
	http.HandleFunc("/api/auth/signup", enableCORS(signup))
	http.HandleFunc("/api/auth/login", enableCORS(login))
	http.HandleFunc("/api/auth/logout", enableCORS(logout))
	http.HandleFunc("/", serveStatic)
	http.HandleFunc("/index.html", serveStatic)
	http.HandleFunc("/style.css", serveStatic)
	http.HandleFunc("/script.js", serveStatic)

	port := getEnv("PORT", "8080")
	fmt.Printf("Fitness API server started on port %s\n", port)
	http.ListenAndServe(":"+port, nil)
}
 