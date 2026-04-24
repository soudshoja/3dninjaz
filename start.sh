#!/usr/bin/env bash
# Canonical boot script for the 3D Ninjaz /v1 Node app on the cPanel server.
#
# Context / why this exists:
#   When operators boot the app via `ssh root@server "su - ninjaz -c './start.sh'"`,
#   the outer ssh channel exits immediately. Without `setsid`, the ninjaz shell
#   and its children (including `node server.js`) share the same session as the
#   exiting sshd/su process, so the kernel sends SIGHUP and the node process
#   dies ~seconds after ssh returns.
#
# The fix: start node in its own new session with `setsid`, redirect stdin from
# /dev/null so it detaches cleanly, redirect stdout/stderr to app.log, and
# disown so the bash `exit` doesn't reap it.
#
# Keep this file in sync with /home/ninjaz/apps/3dninjaz_v1/start.sh on the
# server. Deploys that rsync the repo root should include this file.

set -euo pipefail

APP_DIR="/home/ninjaz/apps/3dninjaz_v1"
NODE_BIN="/home/ninjaz/nodevenv/apps/3dninjaz_v1/20/bin/node"
LOG_FILE="${APP_DIR}/app.log"
PID_FILE="${APP_DIR}/.node.pid"

cd "${APP_DIR}"

# Activate the CloudLinux Node 20 virtualenv so child processes inherit PATH
# and shared lib search paths. `activate` defines `node`/`npm` shims but we
# still invoke node by absolute path below for belt-and-braces.
# NOTE: CloudLinux's `activate` references $CL_VIRTUAL_ENV unconditionally
# which trips `set -u`. Relax nounset just around the source call.
# shellcheck disable=SC1091
set +u
source /home/ninjaz/nodevenv/apps/3dninjaz_v1/20/bin/activate
set -u

# Clean slate — kill any leftover node serving server.js for this user. The
# `|| true` prevents set -e from tripping when there's nothing to kill.
pkill -u "$(id -un)" -f 'node server.js' 2>/dev/null || true
sleep 1

export PORT=3000 HOST=127.0.0.1 HOSTNAME=127.0.0.1 NODE_ENV=production

# setsid  — start a fresh session so the parent ssh/su exit cannot SIGHUP us
# nohup   — extra belt to ignore SIGHUP if setsid is unavailable for any reason
# </dev/null — detach stdin so nothing blocks on a closed tty
# >>app.log 2>&1 — append all output to app.log
# &       — background
# disown  — remove from shell's job table so `exit` won't kill it
setsid nohup "${NODE_BIN}" server.js </dev/null >> "${LOG_FILE}" 2>&1 &
disown || true

sleep 2

# Capture the actual pid that's running so ops scripts can read it back.
if pgrep -u "$(id -un)" -f 'node server.js' > "${PID_FILE}"; then
  echo "started PID $(cat "${PID_FILE}")"
else
  echo "start.sh: node did not come up within 2s — check ${LOG_FILE}" >&2
  exit 1
fi
