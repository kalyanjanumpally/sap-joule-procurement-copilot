#!/usr/bin/env bash
# Consume the deployed SSE endpoint and print tokens live.
# Perfect for a screen recording — one command, real-time output, zero typing.
#
# Usage:  ./scripts/stream-endpoint-demo.sh
#         ./scripts/stream-endpoint-demo.sh http://localhost:4004
#         BASE_URL=... ./scripts/stream-endpoint-demo.sh

set -euo pipefail

BASE_URL="${1:-${BASE_URL:-https://joule-project-api.cfapps.us10-001.hana.ondemand.com}}"

if [ -t 1 ]; then
  DIM=$'\033[2m'; BLD=$'\033[1m'; CYN=$'\033[36m'; GRN=$'\033[32m'; OFF=$'\033[0m'
else
  DIM=''; BLD=''; CYN=''; GRN=''; OFF=''
fi

PO='{"supplier":"Acme Steel GmbH","material":"Cold-rolled steel coil, 1.2mm","quantity":24000,"unit":"kg","netAmount":38400,"currency":"EUR","requestedDelivery":"2026-08-01","requester":"M. Schneider (Plant Munich)"}'

REQ_BODY=$(printf '{"purchaseOrderId":"4500000123","poJson":%s}' "$(printf '%s' "$PO" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')")

echo
echo "${BLD}POST ${CYN}${BASE_URL}/stream/summarizePurchaseOrder${OFF}"
echo "${DIM}(tokens will stream in as the model generates them)${OFF}"
echo
printf "${GRN}"

start_ns=$(python3 -c "import time; print(int(time.time()*1_000_000_000))")
first_token_reported=0

curl -N -sS -X POST "$BASE_URL/stream/summarizePurchaseOrder" \
  -H 'content-type: application/json' \
  -d "$REQ_BODY" | while IFS= read -r line; do
  case "$line" in
    "data: "*)
      json="${line#data: }"
      # Extract type + text via python (jq would work too if available)
      python3 -c "
import json, sys
try:
    e = json.loads('''$json'''.replace(chr(10),' '))
    if e.get('type') == 'text_delta':
        print(e.get('text',''), end='', flush=True)
    elif e.get('type') == 'done':
        u = e.get('usage', {}) or {}
        print(f\"\\n\\n\\033[2m[done: {e.get('model','?')} · in={u.get('input_tokens','?')} out={u.get('output_tokens','?')} · stop={e.get('stopReason','?')}]\\033[0m\")
    elif e.get('type') == 'error':
        print(f\"\\n\\033[31m[error: {e.get('message','?')}]\\033[0m\")
except Exception as ex:
    pass
" 2>/dev/null
      ;;
  esac
done

printf "${OFF}"
echo
