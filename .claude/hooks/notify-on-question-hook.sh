#!/usr/bin/env bash
# Notify On Question
# A Claude Code "PreToolUse" hook matched to the AskUserQuestion tool: fires
# when Claude is about to prompt with questions, so you know to check the
# terminal before the questions time out. Signals with a DOUBLE beep to
# distinguish from the single "done" beep of the Stop hook.

set -euo pipefail

# Consume the hook payload from stdin (unused, but keeps the pipe clean).
cat >/dev/null || true

TITLE="Claude Code"
MESSAGE="Claude is asking you questions - check the terminal!"

if command -v osascript >/dev/null 2>&1; then
	# macOS
	osascript -e "display notification \"${MESSAGE}\" with title \"${TITLE}\""
	osascript -e 'beep 2' >/dev/null 2>&1 || true
elif command -v notify-send >/dev/null 2>&1; then
	# Linux (libnotify)
	notify-send "${TITLE}" "${MESSAGE}"
	printf '\a' && sleep 0.2 && printf '\a'
elif command -v powershell.exe >/dev/null 2>&1; then
	# Windows (Git Bash / WSL): toast notification + two beeps in a single
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
[System.Console]::Beep(1000,180)
Start-Sleep -Milliseconds 120
[System.Console]::Beep(1000,180)
EOF
)
	if command -v iconv >/dev/null 2>&1 && command -v base64 >/dev/null 2>&1; then
		powershell.exe -NoProfile -NonInteractive -EncodedCommand "$(printf '%s' "$PS_SCRIPT" | iconv -f UTF-8 -t UTF-16LE | base64 -w0)" >/dev/null 2>&1 || true
	else
		# Cannot encode the toast script without iconv/base64 - beep only.
		powershell.exe -NoProfile -Command "[System.Console]::Beep(1000,180); Start-Sleep -Milliseconds 120; [System.Console]::Beep(1000,180)" >/dev/null 2>&1 || true
	fi
else
	# Fallback: two terminal bells + stderr message
	printf '\a' && sleep 0.2 && printf '\a'
	printf '%s: %s\n' "${TITLE}" "${MESSAGE}" >&2
fi

exit 0
