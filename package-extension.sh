#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_NAME="TabLedger.zip"
LOCAL_OUTPUT_DIR="$SCRIPT_DIR/output/package"
LOCAL_ZIP_PATH="$LOCAL_OUTPUT_DIR/$ZIP_NAME"
WINDOWS_OUTPUT_DIR="/mnt/c/Users/omri/Documents/TabLedger-Chrome-Ext"
WINDOWS_ZIP_PATH="$WINDOWS_OUTPUT_DIR/$ZIP_NAME"
WATCH_MODE=0
SLEEP_SECONDS=2

CORE_FILES=(
  "manifest.json"
  "background.js"
  "dashboard.html"
  "dashboard.js"
  "popup.html"
  "popup.js"
  "styles.css"
  "icon-16.png"
  "icon-32.png"
  "icon-48.png"
  "icon-128.png"
)

LEGACY_ZIP_NAMES=(
  "TabLedger-chrome-web-store.zip"
)

log() {
  printf '[package-extension] %s\n' "$*"
}

usage() {
  cat <<'EOF'
Usage:
  ./package-extension.sh
  ./package-extension.sh --watch

What it does:
  - zips only the core Chrome extension files
  - copies that single zip to:
    /mnt/c/Users/omri/Documents/TabLedger-Chrome-Ext
  - unzips the app files there
  - deletes the temporary zip after extraction

Modes:
  default   Run once
  --watch   Keep watching the core app files and rebuild after each change
EOF
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    log "Missing required command: $command_name"
    exit 1
  fi
}

format_bytes() {
  local bytes="$1"
  if command -v numfmt >/dev/null 2>&1; then
    numfmt --to=iec --suffix=B "$bytes"
  else
    printf '%s bytes' "$bytes"
  fi
}

ensure_required_files() {
  local missing=0

  log "Checking core extension files..."
  for relative_path in "${CORE_FILES[@]}"; do
    local absolute_path="$SCRIPT_DIR/$relative_path"
    if [[ ! -f "$absolute_path" ]]; then
      log "Missing: $relative_path"
      missing=1
      continue
    fi

    local size_bytes
    size_bytes="$(stat -c '%s' "$absolute_path")"
    log "Including: $relative_path ($(format_bytes "$size_bytes"))"
  done

  if [[ "$missing" -ne 0 ]]; then
    log "Packaging stopped because one or more required files are missing."
    exit 1
  fi
}

compute_watch_fingerprint() {
  local fingerprint_lines=()

  for relative_path in "${CORE_FILES[@]}"; do
    local absolute_path="$SCRIPT_DIR/$relative_path"
    if [[ -f "$absolute_path" ]]; then
      fingerprint_lines+=("$(stat -c '%n|%s|%Y' "$absolute_path")")
    else
      fingerprint_lines+=("$absolute_path|missing")
    fi
  done

  printf '%s\n' "${fingerprint_lines[@]}" | sha256sum | awk '{print $1}'
}

package_extension() {
  require_command zip
  require_command unzip
  require_command sha256sum

  ensure_required_files

  mkdir -p "$LOCAL_OUTPUT_DIR"
  mkdir -p "$WINDOWS_OUTPUT_DIR"

  log "Cleaning up legacy zip names if they exist..."
  for legacy_zip_name in "${LEGACY_ZIP_NAMES[@]}"; do
    rm -f "$LOCAL_OUTPUT_DIR/$legacy_zip_name"
    rm -f "$WINDOWS_OUTPUT_DIR/$legacy_zip_name"
  done

  log "Removing previous local zip if it exists..."
  rm -f "$LOCAL_ZIP_PATH"

  log "Creating fresh zip at: $LOCAL_ZIP_PATH"
  (
    cd "$SCRIPT_DIR"
    zip -q "$LOCAL_ZIP_PATH" "${CORE_FILES[@]}"
  )

  local local_size
  local local_checksum
  local_size="$(stat -c '%s' "$LOCAL_ZIP_PATH")"
  local_checksum="$(sha256sum "$LOCAL_ZIP_PATH" | awk '{print $1}')"

  log "Local zip ready: $(format_bytes "$local_size")"
  log "Local zip sha256: $local_checksum"
  log "Copying zip to Windows path: $WINDOWS_ZIP_PATH"
  cp -f "$LOCAL_ZIP_PATH" "$WINDOWS_ZIP_PATH"

  local windows_size
  windows_size="$(stat -c '%s' "$WINDOWS_ZIP_PATH")"
  log "Windows copy complete: $(format_bytes "$windows_size")"
  log "Refreshing extracted core files in: $WINDOWS_OUTPUT_DIR"

  for relative_path in "${CORE_FILES[@]}"; do
    rm -f "$WINDOWS_OUTPUT_DIR/$relative_path"
  done

  log "Unzipping package into the Windows directory..."
  unzip -oq "$WINDOWS_ZIP_PATH" -d "$WINDOWS_OUTPUT_DIR"

  log "Deleting temporary Windows zip..."
  rm -f "$WINDOWS_ZIP_PATH"

  log "Deleting temporary local zip..."
  rm -f "$LOCAL_ZIP_PATH"

  log "Done."
}

watch_and_package() {
  require_command sha256sum

  log "Watch mode enabled."
  log "Watching only the core extension files listed above."
  log "Press Ctrl+C to stop."

  local last_fingerprint
  last_fingerprint="$(compute_watch_fingerprint)"

  package_extension

  while true; do
    sleep "$SLEEP_SECONDS"

    local next_fingerprint
    next_fingerprint="$(compute_watch_fingerprint)"

    if [[ "$next_fingerprint" == "$last_fingerprint" ]]; then
      continue
    fi

    last_fingerprint="$next_fingerprint"
    log "Change detected in core extension files. Repackaging..."
    package_extension
  done
}

case "${1:-}" in
  "")
    ;;
  --watch)
    WATCH_MODE=1
    ;;
  --help|-h)
    usage
    exit 0
    ;;
  *)
    log "Unknown argument: $1"
    usage
    exit 1
    ;;
esac

if [[ "$WATCH_MODE" -eq 1 ]]; then
  watch_and_package
else
  package_extension
fi
