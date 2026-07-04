#!/usr/bin/env bash
# Notify On Stop
# A Claude Code "Stop" hook: fires when Claude finishes responding and sends a
# desktop notification so you know your turn is ready. Claude Code passes the
# hook payload as JSON on stdin; this script filters out SubagentStop-shaped
# payloads, extracts the session id, and dispatches a native notification on
# macOS, Linux, or Windows.

set -euo pipefail

# Read the hook event payload from stdin (Claude Code provides it as JSON).
PAYLOAD="$(cat || true)"

# Only notify on a true top-level Stop, never a subagent's SubagentStop.
# SubagentStop payloads carry agent_id/agent_type; Stop payloads never do, so
# checking for agent_id is a more reliable guard than hook_event_name alone.
HOOK_EVENT="$(printf '%s' "$PAYLOAD" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)"
if [ -n "$HOOK_EVENT" ] && [ "$HOOK_EVENT" != "Stop" ]; then
	exit 0
fi
if printf '%s' "$PAYLOAD" | grep -q '"agent_id"'; then
	exit 0
fi

# Best-effort extraction of the session id for the notification body. Keep
# only filename-safe characters so the id can be interpolated into the
# notification scripts (AppleScript / toast XML) without escaping issues.
SESSION_ID="$(printf '%s' "$PAYLOAD" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/' | tr -cd 'A-Za-z0-9._-' || true)"
[ -z "$SESSION_ID" ] && SESSION_ID="unknown"

TITLE="Claude Code"
MESSAGE="Finished responding (session: ${SESSION_ID}). Your turn."

if command -v osascript >/dev/null 2>&1; then
	# macOS
	osascript -e "display notification \"${MESSAGE}\" with title \"${TITLE}\""
elif command -v notify-send >/dev/null 2>&1; then
	# Linux (libnotify)
	notify-send "${TITLE}" "${MESSAGE}"
elif command -v powershell.exe >/dev/null 2>&1; then
	# Windows (Git Bash / WSL): toast notification + beep in a single
	# PowerShell invocation. The script goes over -EncodedCommand (UTF-16LE
	# base64) because literal quotes do not survive the bash -> Windows
	# argument handoff reliably. WinRT toast APIs need Windows PowerShell 5.x
	# (powershell.exe), which is exactly what this branch detected.
	PS_SCRIPT=$(cat <<EOF
try {
  \$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  \$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  \$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  \$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${TITLE}</text><text>${MESSAGE}</text></binding></visual></toast>')
  \$toast = New-Object Windows.UI.Notifications.ToastNotification \$xml
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show(\$toast)
} catch {}
[System.Console]::Beep()
EOF
)
	if command -v iconv >/dev/null 2>&1 && command -v base64 >/dev/null 2>&1; then
		powershell.exe -NoProfile -NonInteractive -EncodedCommand "$(printf '%s' "$PS_SCRIPT" | iconv -f UTF-8 -t UTF-16LE | base64 -w0)" >/dev/null 2>&1 || true
	else
		# Cannot encode the toast script without iconv/base64 - beep only.
		powershell.exe -NoProfile -Command "[System.Console]::Beep()" >/dev/null 2>&1 || true
	fi
else
	# Fallback: terminal bell + stderr message
	printf '\a%s: %s\n' "${TITLE}" "${MESSAGE}" >&2
fi

exit 0
