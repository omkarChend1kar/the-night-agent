package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"time"
)

type Config struct {
	BackendURL      string   `json:"backend_url"`
	ServiceID       string   `json:"service_id"`
	LogPaths        []string `json:"log_paths"`
}

type Anomaly struct {
	ID        string   `json:"id"`
	ServiceID string   `json:"serviceId"`
	Timestamp string   `json:"timestamp"`
	Severity  string   `json:"severity"`
	Message   string   `json:"message"`
	Logs      []string `json:"logs"`
	Confidence float64 `json:"confidence"`
}

func main() {
	log.Println("Starting Night Agent Sidecar...")

	// Mock Config for MVP
	config := Config{
		BackendURL: "http://localhost:3000/api/sidecar",
		ServiceID:  "service-1",
		LogPaths:   []string{"./test.log"},
	}

	// Create test log if not exists
	if _, err := os.Stat("./test.log"); os.IsNotExist(err) {
		os.WriteFile("./test.log", []byte("App started\n"), 0644)
	}

	go startHeartbeat(config)
	watchLogs(config)
}

func startHeartbeat(cfg Config) {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		resp, err := http.Post(cfg.BackendURL+"/heartbeat", "application/json", nil)
		if err != nil {
			log.Printf("Heartbeat failed: %v", err)
			continue
		}
		resp.Body.Close()
		log.Println("Heartbeat sent")
	}
}

func watchLogs(cfg Config) {
	// Simple poller for MVP
	files := make(map[string]*os.File)
	
	for _, path := range cfg.LogPaths {
		f, err := os.Open(path)
		if err != nil {
			log.Printf("Failed to open %s: %v", path, err)
			continue
		}
		files[path] = f
		// Seek to end
		f.Seek(0, 2)
	}

	ticker := time.NewTicker(1 * time.Second)
	errorRegex := regexp.MustCompile(`(?i)(error|exception|fail)`)

	for range ticker.C {
		for path, file := range files {
			processLogFile(file, path, errorRegex, cfg)
		}
	}
}

func processLogFile(file *os.File, path string, regex *regexp.Regexp, cfg Config) {
	buf := make([]byte, 1024)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		return
	}
	if n > 0 {
		content := string(buf[:n])
		log.Printf("Read from %s: %s", path, content)
		if regex.MatchString(content) {
			reportAnomaly(content, cfg)
		}
	}
}

func reportAnomaly(logLine string, cfg Config) {
	anomaly := Anomaly{
		ID:        fmt.Sprintf("evt-%d", time.Now().UnixNano()),
		ServiceID: cfg.ServiceID,
		Timestamp: time.Now().Format(time.RFC3339),
		Severity:  "Critical",
		Message:   "Detected error in logs: " + logLine,
		Logs:      []string{logLine},
		Confidence: 1.0,
	}

	jsonData, _ := json.Marshal(anomaly)
	resp, err := http.Post(cfg.BackendURL+"/anomaly", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to report anomaly: %v", err)
		return
	}
	resp.Body.Close()
	log.Printf("Anomaly reported: %s", anomaly.ID)
}
