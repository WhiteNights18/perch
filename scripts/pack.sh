#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
gnome-extensions pack --force --out-dir=dist \
    --extra-source=lib --extra-source=widgets --extra-source=LICENSE \
    --schema=schemas/org.gnome.shell.extensions.perch.gschema.xml .
printf '%s\n' "dist/perch@perilla.local.shell-extension.zip"
