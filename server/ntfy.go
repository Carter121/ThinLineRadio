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
	"fmt"
	"net/http"
	"strings"
	"time"
)

func (controller *Controller) sendNtfy(title, body string, priority int, tags []string) bool {
	topic := controller.Options.NtfyTopic
	if topic == "" {
		return false
	}

	server := controller.Options.NtfyServer
	if server == "" {
		server = "https://ntfy.sh"
	}

	url := strings.TrimRight(server, "/") + "/" + topic

	req, err := http.NewRequest("POST", url, strings.NewReader(body))
	if err != nil {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("ntfy: failed to create request: %v", err))
		return false
	}

	req.Header.Set("Title", title)
	req.Header.Set("Priority", fmt.Sprintf("%d", priority))
	if len(tags) > 0 {
		req.Header.Set("Tags", strings.Join(tags, ","))
	}

	if token := controller.Options.NtfyToken; token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("ntfy: send failed: %v", err))
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("ntfy: unexpected status %d", resp.StatusCode))
		return false
	}

	controller.Logs.LogEvent(LogLevelInfo, fmt.Sprintf("ntfy: delivered (status %d)", resp.StatusCode))
	return true
}
