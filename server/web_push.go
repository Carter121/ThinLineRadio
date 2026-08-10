// Copyright (C) 2026 Carter Carling <carter@cartercarling.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// ---------------------------------------------------------------------------
// Subscription store
// ---------------------------------------------------------------------------

// WebPushSubscription holds a single browser PushSubscription registered by
// the unified-app PWA.
type WebPushSubscription struct {
	Id        uint64
	UserId    uint64
	Endpoint  string
	P256DH    string
	Auth      string
	CreatedAt int64
}

// WebPushSubscriptions is an in-memory store backed by the
// "webPushSubscriptions" PostgreSQL table.  It mirrors the DeviceTokens
// pattern used elsewhere in this server.
type WebPushSubscriptions struct {
	mutex      sync.RWMutex
	byId       map[uint64]*WebPushSubscription
	byEndpoint map[string]*WebPushSubscription
}

func NewWebPushSubscriptions() *WebPushSubscriptions {
	return &WebPushSubscriptions{
		byId:       make(map[uint64]*WebPushSubscription),
		byEndpoint: make(map[string]*WebPushSubscription),
	}
}

// Load reads all subscriptions from the database into memory.
func (s *WebPushSubscriptions) Load(db *Database) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	rows, err := db.Sql.Query(`SELECT "id", "userId", "endpoint", "p256dh", "auth", "createdAt" FROM "webPushSubscriptions"`)
	if err != nil {
		return err
	}
	defer rows.Close()

	s.byId = make(map[uint64]*WebPushSubscription)
	s.byEndpoint = make(map[string]*WebPushSubscription)

	for rows.Next() {
		sub := &WebPushSubscription{}
		if err := rows.Scan(&sub.Id, &sub.UserId, &sub.Endpoint, &sub.P256DH, &sub.Auth, &sub.CreatedAt); err != nil {
			continue
		}
		s.byId[sub.Id] = sub
		s.byEndpoint[sub.Endpoint] = sub
	}
	return rows.Err()
}

// addInMemory inserts a subscription into the in-memory maps only (no DB).
// Used by Add (after the DB write) and by tests.
func (s *WebPushSubscriptions) addInMemory(sub *WebPushSubscription) {
	s.byId[sub.Id] = sub
	s.byEndpoint[sub.Endpoint] = sub
}

// deleteInMemory removes a subscription by endpoint from the in-memory maps.
// Used by Delete (after the DB delete) and by tests.
func (s *WebPushSubscriptions) deleteInMemory(endpoint string) {
	sub, ok := s.byEndpoint[endpoint]
	if !ok {
		return
	}
	delete(s.byId, sub.Id)
	delete(s.byEndpoint, endpoint)
}

// Add persists a new subscription to the DB and adds it to the in-memory store.
// If a subscription for the same endpoint already exists it is replaced.
func (s *WebPushSubscriptions) Add(sub *WebPushSubscription, db *Database) error {
	if sub.CreatedAt == 0 {
		sub.CreatedAt = time.Now().Unix()
	}

	var id int64
	err := db.Sql.QueryRow(
		`INSERT INTO "webPushSubscriptions" ("userId", "endpoint", "p256dh", "auth", "createdAt")
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT ("endpoint") DO UPDATE
		   SET "userId" = EXCLUDED."userId",
		       "p256dh" = EXCLUDED."p256dh",
		       "auth"   = EXCLUDED."auth"
		 RETURNING "id"`,
		sub.UserId, sub.Endpoint, sub.P256DH, sub.Auth, sub.CreatedAt,
	).Scan(&id)
	if err != nil {
		return err
	}

	sub.Id = uint64(id)

	s.mutex.Lock()
	s.addInMemory(sub)
	s.mutex.Unlock()
	return nil
}

// Delete removes a subscription by endpoint from the DB and in-memory store.
func (s *WebPushSubscriptions) Delete(endpoint string, db *Database) error {
	if db != nil {
		if _, err := db.Sql.Exec(`DELETE FROM "webPushSubscriptions" WHERE "endpoint" = $1`, endpoint); err != nil {
			return err
		}
	}

	s.mutex.Lock()
	s.deleteInMemory(endpoint)
	s.mutex.Unlock()
	return nil
}

// GetAll returns a snapshot of all subscriptions for broadcasting.
func (s *WebPushSubscriptions) GetAll() []*WebPushSubscription {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	result := make([]*WebPushSubscription, 0, len(s.byId))
	for _, sub := range s.byId {
		result = append(result, sub)
	}
	return result
}

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------

// WebPushApi exposes three endpoints:
//
//	GET  /api/webpush/vapid-public-key  — returns the VAPID public key (no auth)
//	POST /api/webpush/subscribe         — registers a browser PushSubscription (PIN auth)
//	DELETE /api/webpush/subscribe       — unregisters a subscription (PIN auth)
type WebPushApi struct {
	Controller *Controller
}

func NewWebPushApi(controller *Controller) *WebPushApi {
	return &WebPushApi{Controller: controller}
}

func (wp *WebPushApi) writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func (wp *WebPushApi) writeError(w http.ResponseWriter, status int, msg string) {
	http.Error(w, msg, status)
}

// getUserFromRequest extracts and validates a PIN from the request, returning
// the corresponding user or nil.  Supports both ?pin= query param and
// "Authorization: Bearer <pin>" header, matching the rest of the API.
func (wp *WebPushApi) getUserFromRequest(r *http.Request) *User {
	pin := r.URL.Query().Get("pin")
	if pin == "" {
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			pin = strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if pin == "" {
		return nil
	}
	return wp.Controller.Users.GetUserByPin(pin)
}

// VapidPublicKeyHandler returns the server's VAPID public key so the browser
// can subscribe to push notifications.  No authentication required.
func (wp *WebPushApi) VapidPublicKeyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if wp.Controller.Options.VapidPublicKey == "" {
		wp.writeError(w, http.StatusServiceUnavailable, "Web Push not configured")
		return
	}
	wp.writeJSON(w, map[string]string{"publicKey": wp.Controller.Options.VapidPublicKey})
}

// subscribeRequest is the JSON body for POST /api/webpush/subscribe.
type subscribeRequest struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256DH string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// unsubscribeRequest is the JSON body for DELETE /api/webpush/subscribe.
type unsubscribeRequest struct {
	Endpoint string `json:"endpoint"`
}

// SubscribeHandler handles POST and DELETE for /api/webpush/subscribe.
func (wp *WebPushApi) SubscribeHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		wp.handleSubscribe(w, r)
	case http.MethodDelete:
		wp.handleUnsubscribe(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (wp *WebPushApi) handleSubscribe(w http.ResponseWriter, r *http.Request) {
	user := wp.getUserFromRequest(r)
	if user == nil {
		wp.writeError(w, http.StatusUnauthorized, "PIN required")
		return
	}

	var req subscribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		wp.writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if req.Endpoint == "" || req.Keys.P256DH == "" || req.Keys.Auth == "" {
		wp.writeError(w, http.StatusBadRequest, "endpoint, keys.p256dh, and keys.auth are required")
		return
	}

	sub := &WebPushSubscription{
		UserId:   user.Id,
		Endpoint: req.Endpoint,
		P256DH:   req.Keys.P256DH,
		Auth:     req.Keys.Auth,
	}
	if err := wp.Controller.WebPushSubscriptions.Add(sub, wp.Controller.Database); err != nil {
		wp.Controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("web push: failed to save subscription for user %d: %v", user.Id, err))
		wp.writeError(w, http.StatusInternalServerError, "Failed to save subscription")
		return
	}

	wp.Controller.Logs.LogEvent(LogLevelInfo, fmt.Sprintf("web push: registered subscription for user %d", user.Id))
	w.WriteHeader(http.StatusCreated)
}

func (wp *WebPushApi) handleUnsubscribe(w http.ResponseWriter, r *http.Request) {
	user := wp.getUserFromRequest(r)
	if user == nil {
		wp.writeError(w, http.StatusUnauthorized, "PIN required")
		return
	}

	var req unsubscribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		wp.writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if req.Endpoint == "" {
		wp.writeError(w, http.StatusBadRequest, "endpoint is required")
		return
	}

	if err := wp.Controller.WebPushSubscriptions.Delete(req.Endpoint, wp.Controller.Database); err != nil {
		wp.Controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("web push: failed to delete subscription for user %d: %v", user.Id, err))
		wp.writeError(w, http.StatusInternalServerError, "Failed to delete subscription")
		return
	}

	wp.Controller.Logs.LogEvent(LogLevelInfo, fmt.Sprintf("web push: unregistered subscription for user %d", user.Id))
	w.WriteHeader(http.StatusNoContent)
}

// TestWebPushHandler handles POST /api/admin/webpush/test and sends a test
// notification to all subscriptions belonging to the specified user ID.
// Requires admin JWT. Accepts JSON body: {"userId": 123}
func (wp *WebPushApi) TestWebPushHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		UserId uint64 `json:"userId"`
		Title  string `json:"title"`
		Body   string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserId == 0 {
		wp.writeError(w, http.StatusBadRequest, "userId is required")
		return
	}

	if wp.Controller.Options.VapidPublicKey == "" || wp.Controller.Options.VapidPrivateKey == "" {
		wp.writeError(w, http.StatusServiceUnavailable, "Web Push not configured")
		return
	}

	user := wp.Controller.Users.GetUserById(req.UserId)
	if user == nil {
		wp.writeError(w, http.StatusNotFound, "User not found")
		return
	}

	title := req.Title
	if title == "" {
		title = "TEST NOTIFICATION"
	}
	body := req.Body
	if body == "" {
		body = fmt.Sprintf("This is a test web push notification for user %d (%s)", user.Id, user.Email)
	}

	allSubs := wp.Controller.WebPushSubscriptions.GetAll()
	var matched []*WebPushSubscription
	for _, sub := range allSubs {
		if sub.UserId == req.UserId {
			matched = append(matched, sub)
		}
	}

	if len(matched) == 0 {
		wp.writeError(w, http.StatusNotFound, "No web push subscriptions found for user")
		return
	}

	for _, sub := range matched {
		go wp.Controller.sendWebPush(sub, title, body)
	}

	wp.Controller.Logs.LogEvent(LogLevelInfo, fmt.Sprintf("web push: sent test notification to %d subscription(s) for user %d", len(matched), req.UserId))

	wp.writeJSON(w, map[string]interface{}{
		"message":       "Test web push notification sent",
		"userId":        req.UserId,
		"subscriptions": len(matched),
	})
}

// ---------------------------------------------------------------------------
// Battalion detection + send
// ---------------------------------------------------------------------------

// hasBattalionUnit reports whether transcript contains a parsed battalion unit.
// It is a pure function so it can be tested independently of the Controller.
func hasBattalionUnit(parser *TranscriptParser, transcript string) bool {
	if parser == nil || transcript == "" {
		return false
	}
	units := parser.ParseUnits(strings.ToUpper(transcript))
	for _, u := range units {
		if u.Apparatus == "BATTALION" {
			return true
		}
	}
	return false
}

// sendWebPushIfBattalion checks whether the transcript contains a battalion
// unit and, if so, sends a Web Push notification to all registered browsers
// and an ntfy notification (if configured).
// Called as a goroutine from the transcription queue after transcription.
func (controller *Controller) sendWebPushIfBattalion(call *Call, transcript string) {
	parser := activeTranscriptParser.Load()

	//* Apply the fuzzy corrections list so detection, title, and body all match
	//* what the UI shows (the API applies AnnotateTranscript at read time)
	if parser != nil {
		transcript = parser.CorrectTranscript(transcript)
	}

	if !hasBattalionUnit(parser, transcript) {
		return
	}

	// Build title from parsed battalion units
	battalionTitle := ""
	if parser != nil {
		units := parser.ParseUnits(strings.ToUpper(transcript))
		var names []string
		for _, u := range units {
			if u.Apparatus == "BATTALION" {
				name := u.Apparatus
				if u.Number != "" {
					name += " " + u.Number
				}
				names = append(names, name)
			}
		}
		if len(names) > 0 {
			battalionTitle = strings.Join(names, ", ")
		}
	}

	// Build title from system / talkgroup labels
	title := "BATTALION DISPATCHED"
	if call != nil && call.System != nil && call.Talkgroup != nil {
		title = fmt.Sprintf("%s / %s — BATTALION",
			strings.ToUpper(call.System.Label),
			strings.ToUpper(call.Talkgroup.Label))
	}

	body := strings.ToUpper(transcript)

	// Send ntfy notification
	if controller.Options.NtfyTopic != "" {
		ntfyTitle := battalionTitle
		if ntfyTitle == "" {
			ntfyTitle = title
		}
		//* Deep link to the alert page; skipped when BaseUrl is unset so the
		//* normalizePublicBaseURL localhost fallback never reaches subscribers
		alertUrl := ""
		if call != nil && strings.TrimSpace(controller.Options.BaseUrl) != "" {
			alertUrl = normalizePublicBaseURL(controller.Options.BaseUrl) + fmt.Sprintf("/alert/%d", call.Id)
		}
		go controller.sendNtfy(ntfyTitle, body, 3, []string{"fire_engine"}, alertUrl)
	}

	// Send Web Push notifications
	if controller.Options.VapidPublicKey == "" || controller.Options.VapidPrivateKey == "" {
		return
	}

	subs := controller.WebPushSubscriptions.GetAll()
	if len(subs) == 0 {
		return
	}

	controller.Logs.LogEvent(LogLevelInfo, fmt.Sprintf("web push: battalion detected — sending to %d subscriber(s)", len(subs)))

	for _, sub := range subs {
		go controller.sendWebPush(sub, title, body)
	}
}

// sendWebPush encrypts and delivers a single Web Push message to one browser
// subscription.  A 410 Gone response means the subscription has expired and
// is removed automatically.
func (controller *Controller) sendWebPush(sub *WebPushSubscription, title, body string) {
	payload, err := json.Marshal(map[string]interface{}{
		"title": title,
		"body":  body,
		"data":  map[string]string{"url": "/tlr/pwa"},
	})
	if err != nil {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("web push: failed to marshal payload: %v", err))
		return
	}

	resp, err := webpush.SendNotification(payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.P256DH,
			Auth:   sub.Auth,
		},
	}, &webpush.Options{
		VAPIDPublicKey:  controller.Options.VapidPublicKey,
		VAPIDPrivateKey: controller.Options.VapidPrivateKey,
		Subscriber:      controller.Options.VapidSubject,
		TTL:             60,
	})
	if err != nil {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("web push: send failed for endpoint %s: %v", sub.Endpoint, err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusGone {
		// Subscription expired — clean it up silently
		controller.Logs.LogEvent(LogLevelInfo, fmt.Sprintf("web push: removing expired subscription (410 Gone) for user %d", sub.UserId))
		_ = controller.WebPushSubscriptions.Delete(sub.Endpoint, controller.Database)
		return
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("web push: unexpected status %d for user %d", resp.StatusCode, sub.UserId))
		return
	}

	controller.Logs.LogEvent(LogLevelInfo, fmt.Sprintf("web push: delivered to user %d (status %d)", sub.UserId, resp.StatusCode))
}
