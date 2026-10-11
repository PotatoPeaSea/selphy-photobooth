# Shared by the fake CUPS commands. Sourced, never run directly.
#
# All state lives in $FAKE_CUPS_STATE:
#   state          one word: ready busy jammed out_of_paper out_of_ink cover_open
#                  offline disabled unknown (missing file means ready)
#   jobs           `lpstat -o` lines, one per job
#   next_id        next job number
#   log            one line per call: command name, then each argument, tab-separated
#   fail           optional: a command name; that command exits 1 when called
#   last_lp_input  the bytes lp received on stdin most recently
# FAKE_PRINTER overrides the printer name (default TestPrinter).

: "${FAKE_CUPS_STATE:?FAKE_CUPS_STATE must name the fake state directory}"
PRINTER="${FAKE_PRINTER:-TestPrinter}"
mkdir -p "$FAKE_CUPS_STATE"

fake_state() {
  local s
  s="$(cat "$FAKE_CUPS_STATE/state" 2>/dev/null)"
  printf '%s' "${s:-ready}"
}

# $1 = command name, remaining arguments are its argv exactly as received.
fake_call() {
  local name="$1"
  shift
  local line="$name"
  local arg
  for arg in "$@"; do
    line="$line"$'\t'"$arg"
  done
  printf '%s\n' "$line" >> "$FAKE_CUPS_STATE/log"
  if [ -f "$FAKE_CUPS_STATE/fail" ] && [ "$(cat "$FAKE_CUPS_STATE/fail")" = "$name" ]; then
    echo "$name: simulated failure" >&2
    exit 1
  fi
}
