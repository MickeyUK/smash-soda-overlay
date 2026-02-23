package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type Theme struct {
	ID   string
	Meta map[string]interface{}
}

type StyleService struct {
	rawBaseURL string
}

func NewStyleService() *StyleService {
	return &StyleService{
		rawBaseURL: "https://raw.githubusercontent.com/trybuchet/smash-soda-registry/main/overlay/themes",
	}
}

func (s *StyleService) DownloadTheme(themeID string, files []string) error {
	if themeID == "" {
		return fmt.Errorf("theme ID is required")
	}

	cleanThemeID := filepath.Base(themeID)
	if cleanThemeID != themeID {
		return fmt.Errorf("invalid theme ID")
	}

	execDir, err := GetExecutableDir()
	if err != nil {
		return err
	}

	themeDir := filepath.Join(execDir, "themes", cleanThemeID)
	if err := os.MkdirAll(themeDir, os.ModePerm); err != nil {
		return err
	}

	filesToDownload := append(append([]string{}, files...), cleanThemeID+".css", "meta.json")
	seen := make(map[string]struct{}, len(filesToDownload))

	for _, file := range filesToDownload {
		cleanFile, err := cleanRelativeThemePath(file)
		if err != nil {
			return err
		}
		if _, exists := seen[cleanFile]; exists {
			continue
		}
		seen[cleanFile] = struct{}{}

		url := fmt.Sprintf("%s/%s/%s", s.rawBaseURL, cleanThemeID, cleanFile)
		dst := filepath.Join(themeDir, cleanFile)

		err = downloadThemeFile(url, dst)
		if err != nil {
			if err == errThemeNotFound {
				// CSS is required for a valid theme install.
				if cleanFile == cleanThemeID+".css" {
					return fmt.Errorf("theme stylesheet not found: %s", cleanFile)
				}
				continue
			}
			return err
		}
	}

	if err := ensureThemeMeta(themeDir, cleanThemeID); err != nil {
		return err
	}

	return nil
}

func (s *StyleService) GetOverlayStyles() []Theme {
	themes := make([]Theme, 0)

	dir, err := GetExecutableDir()
	if err != nil {
		fmt.Println("Error getting executable directory:", err)
		return themes
	}

	themesDir := filepath.Join(dir, "themes")
	if _, err := os.Stat(themesDir); os.IsNotExist(err) {
		fmt.Println("Themes directory does not exist:", themesDir)
		return themes
	}

	entries, err := os.ReadDir(themesDir)
	if err != nil {
		fmt.Println("Error reading themes directory:", err)
		return themes
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		themeID := entry.Name()
		themePath := filepath.Join(themesDir, themeID)

		metaPath := filepath.Join(themePath, "meta.json")
		metaContent, metaErr := os.ReadFile(metaPath)
		if metaErr != nil || len(metaContent) == 0 {
			metaContent = []byte("{}")
		}

		var meta map[string]interface{}
		if err := json.Unmarshal(metaContent, &meta); err != nil {
			fmt.Println("Error parsing meta file for theme:", themeID, err)
			meta = map[string]interface{}{}
		}

		if meta == nil {
			meta = map[string]interface{}{}
		}
		if _, ok := meta["id"]; !ok {
			meta["id"] = themeID
		}
		if _, ok := meta["name"]; !ok {
			meta["name"] = themeID
		}

		themes = append(themes, Theme{
			ID:   themeID,
			Meta: meta,
		})
	}

	return themes
}

func (s *StyleService) GetOverlayThemeCSS(themeID string) (string, error) {
	if themeID == "" {
		return "", fmt.Errorf("theme ID is required")
	}

	cleanID := filepath.Base(themeID)
	if cleanID != themeID {
		return "", fmt.Errorf("invalid theme ID")
	}

	dir, err := GetExecutableDir()
	if err != nil {
		return "", fmt.Errorf("error getting executable directory: %w", err)
	}

	cssPath := filepath.Join(dir, "themes", cleanID, cleanID+".css")
	cssContent, err := os.ReadFile(cssPath)
	if err != nil {
		return "", fmt.Errorf("error reading theme CSS: %w", err)
	}

	return string(cssContent), nil
}

var errThemeNotFound = fmt.Errorf("not found")

func cleanRelativeThemePath(file string) (string, error) {
	cleanFile := filepath.Clean(file)
	if cleanFile == "." || cleanFile == "" {
		return "", fmt.Errorf("invalid theme file path: %q", file)
	}
	if filepath.IsAbs(cleanFile) || cleanFile == ".." || strings.HasPrefix(cleanFile, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("invalid theme file path: %q", file)
	}
	return cleanFile, nil
}

func ensureThemeMeta(themeDir, themeID string) error {
	metaPath := filepath.Join(themeDir, "meta.json")

	metaContent, err := os.ReadFile(metaPath)
	if err == nil && len(metaContent) > 0 {
		return nil
	}

	fallbackMeta, err := json.Marshal(map[string]interface{}{
		"id":          themeID,
		"name":        themeID,
		"author":      "Unknown",
		"description": "",
	})
	if err != nil {
		return err
	}

	return os.WriteFile(metaPath, fallbackMeta, 0o644)
}

func downloadThemeFile(url, filePath string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return errThemeNotFound
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("http %d: %s", resp.StatusCode, url)
	}

	if err := os.MkdirAll(filepath.Dir(filePath), os.ModePerm); err != nil {
		return err
	}

	out, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}
