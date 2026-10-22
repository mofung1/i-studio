package studio

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"unicode/utf8"
)

type announcement struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

func validAnnouncement(c operationSettings) bool {
	return utf8.RuneCountInString(c.AnnouncementTitle) <= 60 && utf8.RuneCountInString(c.AnnouncementContent) <= 2000 &&
		(!c.AnnouncementEnabled || (strings.TrimSpace(c.AnnouncementTitle) != "" && strings.TrimSpace(c.AnnouncementContent) != ""))
}

func publishedAnnouncement(c operationSettings) *announcement {
	if !c.AnnouncementEnabled {
		return nil
	}
	digest := sha256.Sum256([]byte(c.AnnouncementTitle + "\x00" + c.AnnouncementContent))
	return &announcement{ID: hex.EncodeToString(digest[:]), Title: c.AnnouncementTitle, Content: c.AnnouncementContent}
}
