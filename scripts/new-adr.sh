#!/usr/bin/env bash
# Create the next numbered ADR from the template: scripts/new-adr.sh "Title of decision"
set -euo pipefail
title="${1:?usage: new-adr.sh \"Title\"}"
dir="$(cd "$(dirname "$0")/.." && pwd)/docs/adr"
last=$(ls "$dir" | grep -E '^[0-9]{4}-' | sort | tail -1 | cut -c1-4)
next=$(printf '%04d' $((10#${last:-0} + 1)))
slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')
file="$dir/$next-$slug.md"
sed -e "s/{{NUMBER}}/$next/" -e "s/{{TITLE}}/$title/" -e "s/{{DATE}}/$(date +%F)/" "$dir/template.md" > "$file"
echo "$file"
# Append a row to the index; fill in Kind/Status when the ADR is accepted.
printf '| [%s](%s) | %s | TBD | Proposed |\n' "$next" "$(basename "$file")" "$title" >> "$dir/README.md"
