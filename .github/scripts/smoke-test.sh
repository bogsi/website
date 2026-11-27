#!/usr/bin/env bash
# Daily production smoke test (task T48). Read-only: it never submits an
# order, only requests that must be rejected before any work is done.
# Usage: .github/scripts/smoke-test.sh [site] [admin]
set -uo pipefail

SITE="${1:-https://roussev.dev}"
ADMIN="${2:-https://admin.roussev.dev}"
UA="roussev-smoke-test/1 (+https://github.com/bogsi/website)"
failures=0

pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; echo "::error::$1"; failures=$((failures + 1)); }
warn() { echo "warn - $1"; echo "::warning::$1"; }

# status <method> <url> [extra curl args...] → prints the HTTP status code
status() {
  local method="$1" url="$2"; shift 2
  curl -sS -o /dev/null -w '%{http_code}' -A "$UA" --max-time 20 -X "$method" "$@" "$url" || echo "000"
}

expect_status() {
  local want="$1" label="$2"; shift 2
  local got
  got=$(status "$@")
  if [[ ",$want," == *",$got,"* ]]; then pass "$label ($got)"; else fail "$label: expected $want, got $got"; fi
}

# Pages and headers
headers=$(curl -sS -D - -o /dev/null -A "$UA" --max-time 20 "$SITE/" | tr -d '\r')
grep -qi '^HTTP/[0-9.]* 200' <<<"$headers" && pass "home page 200" || fail "home page is not 200"
grep -qi "^content-security-policy:.*frame-ancestors 'none'" <<<"$headers" && pass "CSP header present" || fail "CSP header missing or changed"
grep -qi '^strict-transport-security:' <<<"$headers" && pass "HSTS header present" || fail "HSTS header missing"

order_page=$(curl -sS -A "$UA" --max-time 20 "$SITE/order/")
grep -q 'cf-turnstile' <<<"$order_page" && pass "order form has the Turnstile widget" || fail "order form lost the Turnstile widget"

expect_status 301,308 "plain HTTP redirects to HTTPS" GET "http://${SITE#https://}/"
expect_status 200 "sitemap.xml" GET "$SITE/sitemap.xml"
curl -sS -A "$UA" --max-time 20 "$SITE/robots.txt" | grep -q '^Sitemap: ' && pass "robots.txt points to the sitemap" || fail "robots.txt has no Sitemap line"

# security.txt must not expire unnoticed (renew at least 30 days ahead)
sectxt=$(curl -sS -A "$UA" --max-time 20 "$SITE/.well-known/security.txt")
expires=$(sed -n 's/^Expires: *//p' <<<"$sectxt" | tr -d '\r')
if [[ -z "$expires" ]]; then
  fail "security.txt missing or has no Expires"
elif (( $(date -d "$expires" +%s) - $(date +%s) < 30 * 86400 )); then
  fail "security.txt expires on $expires: renew static/.well-known/security.txt"
else
  pass "security.txt valid until $expires"
fi

# Order endpoint: rejected before Turnstile, D1 or Resend
expect_status 415 "order API rejects non-JSON" POST "$SITE/api/order" -H 'Content-Type: text/plain' --data 'smoke'
expect_status 403 "order API allows POST only (WAF rule)" GET "$SITE/api/order"
expect_status 403 "scanner path is blocked (WAF rule)" GET "$SITE/.env"

# Admin: never reachable without Cloudflare Access
admin_status=$(status GET "$ADMIN/api/me")
if [[ "$admin_status" == "200" ]]; then
  fail "admin API answered 200 without Access"
elif [[ "$admin_status" =~ ^(302|401|403)$ ]]; then
  pass "admin API is behind Access ($admin_status)"
else
  fail "admin API returned $admin_status (expected an Access redirect or 401/403)"
fi

# DNSSEC: a warning until the registry publishes the DS record
if [[ -n "$(dig +short DS "${SITE#https://}" @1.1.1.1 2>/dev/null)" ]]; then
  pass "DNSSEC DS record published"
else
  warn "no DS record yet for ${SITE#https://} (DNSSEC not active at the registry)"
fi

echo "---"
if (( failures > 0 )); then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
