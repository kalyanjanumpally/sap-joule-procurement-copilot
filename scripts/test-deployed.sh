#!/usr/bin/env bash
# Fires 6 varied test cases against the deployed joule-project-api CAP endpoint
# and prints a clean summary table. Zero typing during a screen recording.
#
# Usage:  ./scripts/test-deployed.sh
#         ./scripts/test-deployed.sh http://localhost:4004    # test local dev
#         BASE_URL=https://... ./scripts/test-deployed.sh     # via env var

set -euo pipefail

BASE_URL="${1:-${BASE_URL:-https://joule-project-api.cfapps.us10-001.hana.ondemand.com}}"

# ---- deps ---------------------------------------------------------------

for cmd in curl jq python3; do
  command -v "$cmd" >/dev/null || { echo "ERROR: '$cmd' not installed"; exit 1; }
done

# ---- colors (only if TTY) -----------------------------------------------

if [ -t 1 ]; then
  GRN=$'\033[0;32m'; RED=$'\033[0;31m'; YEL=$'\033[1;33m'
  CYN=$'\033[0;36m'; DIM=$'\033[2m'; BLD=$'\033[1m'; NC=$'\033[0m'
else
  GRN=''; RED=''; YEL=''; CYN=''; DIM=''; BLD=''; NC=''
fi

now_ms() { python3 -c "import time; print(int(time.time()*1000))"; }

# ---- test cases ---------------------------------------------------------
# Each: NAME | ENDPOINT | payload file
# poJson / invoiceJson are strings-of-JSON per the API contract

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/po1.json" <<'EOF'
{
  "purchaseOrderId": "4500000123",
  "poJson": "{\"supplier\":\"Acme Steel GmbH\",\"material\":\"Cold-rolled steel coil, 1.2mm\",\"quantity\":24000,\"unit\":\"kg\",\"netAmount\":38400,\"currency\":\"EUR\",\"requestedDelivery\":\"2026-08-01\",\"requester\":\"M. Schneider (Plant Munich)\"}"
}
EOF

cat > "$tmp/po2.json" <<'EOF'
{
  "purchaseOrderId": "4500000456",
  "poJson": "{\"supplier\":\"Office Supplies Direct\",\"material\":\"Ballpoint pens, blue, box of 50\",\"quantity\":10,\"unit\":\"box\",\"netAmount\":85,\"currency\":\"EUR\",\"requestedDelivery\":\"2026-07-25\",\"requester\":\"J. Miller (HQ Admin)\"}"
}
EOF

cat > "$tmp/po3.json" <<'EOF'
{
  "purchaseOrderId": "4500000789",
  "poJson": "{\"supplier\":\"Vendor Unknown Ltd (new, no history)\",\"material\":\"Rack-mount server, 2U, 512GB RAM\",\"quantity\":6,\"unit\":\"unit\",\"netAmount\":78000,\"currency\":\"EUR\",\"requestedDelivery\":\"2026-07-18\",\"requester\":\"IT ops\",\"note\":\"Emergency replacement; standard 6-week lead time waived\"}"
}
EOF

cat > "$tmp/inv1.json" <<'EOF'
{
  "invoiceId": "INV-2026-0912",
  "invoiceJson": "{\"supplier\":\"NoName Trading LLC\",\"grossAmount\":142500,\"currency\":\"EUR\",\"dueDate\":\"2026-05-18\",\"paidDate\":null,\"poReference\":null,\"companyCode\":\"1710\"}"
}
EOF

cat > "$tmp/inv2.json" <<'EOF'
{
  "invoiceId": "INV-2026-1044",
  "invoiceJson": "{\"supplier\":\"Regional Supplier Co\",\"grossAmount\":62000,\"currency\":\"EUR\",\"dueDate\":\"2026-09-15\",\"paidDate\":null,\"poReference\":null,\"companyCode\":\"1710\"}"
}
EOF

cat > "$tmp/inv3.json" <<'EOF'
{
  "invoiceId": "INV-2026-1250",
  "invoiceJson": "{\"supplier\":\"Trusted Vendor GmbH (5yr history)\",\"grossAmount\":4200,\"currency\":\"EUR\",\"dueDate\":\"2026-09-30\",\"paidDate\":null,\"poReference\":\"4500001234\",\"companyCode\":\"1710\"}"
}
EOF

TESTS=(
  "Large steel PO (approver-ready)|summarizePurchaseOrder|$tmp/po1.json|.summary|null"
  "Small consumables PO           |summarizePurchaseOrder|$tmp/po2.json|.summary|null"
  "Off-catalog IT hardware (rush) |summarizePurchaseOrder|$tmp/po3.json|.summary|null"
  "High-risk unmatched invoice    |explainInvoiceRisk    |$tmp/inv1.json|.rationale|.risk"
  "Medium-risk overdue invoice    |explainInvoiceRisk    |$tmp/inv2.json|.rationale|.risk"
  "Low-risk paid invoice          |explainInvoiceRisk    |$tmp/inv3.json|.rationale|.risk"
)

# ---- run ----------------------------------------------------------------

echo
echo "${BLD}Target:${NC} $BASE_URL"
echo
printf "%-3s %-32s %-8s %-8s  %s\n" "#" "Case" "Latency" "Tokens" "Result"
printf "%-3s %-32s %-8s %-8s  %s\n" "--" "--------------------------------" "--------" "--------" "-------"

total_ms=0; total_tokens=0; passed=0; total=${#TESTS[@]}

trim() { echo "$1" | awk '{$1=$1;print}'; }

for i in "${!TESTS[@]}"; do
  IFS='|' read -r name endpoint payload_file text_field label_field <<< "${TESTS[$i]}"
  name_trim=$(trim "$name")
  endpoint=$(trim "$endpoint")
  payload_file=$(trim "$payload_file")
  text_field=$(trim "$text_field")
  label_field=$(trim "$label_field")

  t0=$(now_ms)
  response=$(curl -sS -X POST "$BASE_URL/ai/$endpoint" \
    -H 'content-type: application/json' \
    --data @"$payload_file" 2>&1) || { echo "${RED}FAIL${NC} network error"; continue; }
  t1=$(now_ms)
  ms=$((t1 - t0))

  err=$(echo "$response" | jq -r '.error.message // empty' 2>/dev/null || echo "")
  if [ -n "$err" ]; then
    printf "%-3s %-32s %s\n" "$((i+1))." "$name_trim" "${RED}ERROR: $err${NC}"
    continue
  fi

  tokens=$(echo "$response" | jq -r '.tokensUsed // 0')
  text=$(echo "$response" | jq -r "$text_field // \"(none)\"")
  label=$(echo "$response" | jq -r "$label_field // empty")

  # display label (risk rating) if present, else colored ok
  if [ -n "$label" ] && [ "$label" != "null" ]; then
    case "$label" in
      high)   badge="${RED}HIGH${NC}   " ;;
      medium) badge="${YEL}MEDIUM${NC} " ;;
      low)    badge="${GRN}LOW${NC}    " ;;
      *)      badge="$label" ;;
    esac
  else
    badge="${GRN}ok${NC}     "
  fi

  printf "%-3s %-32s %-8s %-8s  %s\n" "$((i+1))." "$name_trim" "${ms}ms" "$tokens" "$badge"
  # snippet on next line, dim
  snippet=$(echo "$text" | head -c 100 | tr '\n' ' ')
  printf "    ${DIM}%s${NC}\n" "\"${snippet}...\""

  total_ms=$((total_ms + ms))
  total_tokens=$((total_tokens + tokens))
  passed=$((passed + 1))
done

echo
if [ "$passed" -eq "$total" ]; then
  avg=$((total_ms / total))
  echo "${GRN}${BLD}Summary:${NC} $passed/$total passed  ·  avg ${avg}ms  ·  $total_tokens tokens total"
else
  echo "${YEL}${BLD}Summary:${NC} $passed/$total passed"
  exit 1
fi
