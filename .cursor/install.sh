#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for Supermarket Fly.
# Installs the unixODBC development headers required to build the native
# msnodesqlv8 addon, then refreshes Node dependencies for every package.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# msnodesqlv8 is compiled with node-gyp and needs <sql.h> from unixodbc-dev.
if [ ! -f /usr/include/sql.h ]; then
  echo "==> Installing unixODBC development headers"
  sudo apt-get update -qq
  sudo apt-get install -y -qq unixodbc unixodbc-dev
else
  echo "==> unixODBC headers already present"
fi

install_pkg() {
  local dir="$1"
  echo "==> Installing dependencies in ${dir}"
  if [ -f "${dir}/package-lock.json" ]; then
    (cd "$dir" && npm ci)
  else
    (cd "$dir" && npm install)
  fi
}

install_pkg "."
install_pkg "server"
install_pkg "desktop"

# The server reads server/.env; seed it from the checked-in example when absent.
if [ ! -f server/.env ] && [ -f server/.env.example ]; then
  echo "==> Creating server/.env from server/.env.example"
  cp server/.env.example server/.env
fi

echo "==> Bootstrap complete"
