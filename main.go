package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const WGER_API = "https://wger.de/api/v2"
const SUPABASE_URL = "https://egskxibwbafmruhnsiyd.supabase.co"
const SUPABASE_ANON_KEY = "sb_publishable_45Yb6kMRPHZymtDcc7VaGg_Xq73NfxI"

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
		http.Error(w, "Erreur lors de l'appel à l'API", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Erreur de lecture", http.StatusInternalServerError)
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
		http.Error(w, "Paramètre 'muscle' requis", http.StatusBadRequest)
		return
	}

	resp, err := http.Get(WGER_API + "/exerciseinfo/?muscles=" + muscleID + "&language=12&status=2")
	if err != nil {
		http.Error(w, "Erreur lors de l'appel à l'API", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Erreur de lecture", http.StatusInternalServerError)
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

// Signup - Inscription
func signup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var authReq AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&authReq); err != nil {
		http.Error(w, "Données invalides", http.StatusBadRequest)
		return
	}

	payload, _ := json.Marshal(authReq)
	req, _ := http.NewRequest("POST", SUPABASE_URL+"/auth/v1/signup", bytes.NewBuffer(payload))
	req.Header.Set("apikey", SUPABASE_ANON_KEY)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Erreur lors de l'inscription", http.StatusInternalServerError)
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

	var authReq AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&authReq); err != nil {
		http.Error(w, "Données invalides", http.StatusBadRequest)
		return
	}

	payload, _ := json.Marshal(authReq)
	req, _ := http.NewRequest("POST", SUPABASE_URL+"/auth/v1/token?grant_type=password", bytes.NewBuffer(payload))
	req.Header.Set("apikey", SUPABASE_ANON_KEY)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Erreur lors de la connexion", http.StatusInternalServerError)
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
	w.Write([]byte(`{"message":"Déconnecté avec succès"}`))
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

func main() {
	http.HandleFunc("/api/muscles", enableCORS(getMuscles))
	http.HandleFunc("/api/exercises", enableCORS(getExercises))
	http.HandleFunc("/api/auth/signup", enableCORS(signup))
	http.HandleFunc("/api/auth/login", enableCORS(login))
	http.HandleFunc("/api/auth/logout", enableCORS(logout))
	http.HandleFunc("/", serveStatic)
	http.HandleFunc("/index.html", serveStatic)
	http.HandleFunc("/style.css", serveStatic)
	http.HandleFunc("/script.js", serveStatic)

	fmt.Println("🏋️ Serveur Fitness API lancé sur http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}
 