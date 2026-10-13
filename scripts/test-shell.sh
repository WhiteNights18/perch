#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir="${1:?Usage: bash scripts/test-shell.sh ABSOLUTE_EMPTY_TEST_DIRECTORY}"
[[ "$test_dir" = /* ]] || { echo 'Absolute test directory required'; exit 2; }
mkdir -p "$test_dir"
[[ -z "$(ls -A "$test_dir")" ]] || { echo 'Test directory must be empty'; exit 2; }
export PERCH_TEST_OUTPUT="$test_dir"
python3 tests/make-photo-fixtures.py "$test_dir/photos"
export XDG_RUNTIME_DIR="$test_dir/runtime"
export XDG_CONFIG_HOME="$test_dir/config"
export XDG_DATA_HOME="$test_dir/data"
export XDG_CACHE_HOME="$test_dir/cache"
export GSETTINGS_BACKEND=keyfile
export LIBGL_ALWAYS_SOFTWARE=1
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"
chmod 700 "$XDG_RUNTIME_DIR"
bash scripts/pack.sh
test_extension="$XDG_DATA_HOME/gnome-shell/extensions/perch@perilla.local"
mkdir -p "$test_extension"
unzip -q dist/perch@perilla.local.shell-extension.zip -d "$test_extension"
mv "$test_extension/extension.js" "$test_extension/perch.js"
mv "$test_extension/prefs.js" "$test_extension/perch-prefs.js"
cp tests/prefs-harness.js "$test_extension/prefs.js"
cp tests/mpris-fixture.js "$test_extension/mpris-fixture.js"
cp tests/shell-harness.js "$test_extension/extension.js"
glib-compile-schemas "$test_extension/schemas"
gsettings set org.gnome.shell enabled-extensions "['perch@perilla.local']"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell welcome-dialog-last-shown-version '51.0'
gsettings set org.gnome.desktop.session idle-delay 0
# Virtual devices begin at (0,0); keep that from triggering the overview.
gsettings set org.gnome.desktop.interface enable-hot-corners false
gsettings set org.gnome.desktop.background picture-uri ''
gsettings set org.gnome.desktop.background picture-uri-dark ''
gsettings set org.gnome.desktop.background primary-color '#253c46'
gsettings set org.gnome.desktop.background color-shading-type 'solid'
dbus-run-session -- bash -c '
    gnome-shell --headless --wayland --no-x11 --virtual-monitor=1440x1000 &
    shell_pid=$!
    trap "kill $shell_pid 2>/dev/null || true" EXIT
    for ((i=0; i<150; i++)); do
        if [[ -f "$PERCH_TEST_OUTPUT/result.txt" ]]; then
            cat "$PERCH_TEST_OUTPUT/result.txt"
            exit 0
        fi
        kill -0 "$shell_pid" 2>/dev/null || exit 1
        sleep 1
    done
    echo "Shell test timed out"
    exit 1
' > "$test_dir/shell.log" 2>&1
cat "$test_dir/result.txt"
[[ "$(cat "$test_dir/result.txt")" = PASS ]]
