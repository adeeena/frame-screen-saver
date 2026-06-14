#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
REPO_URL="https://github.com/adeeena/frame-screen-saver.git"
INSTALL_DIR="/home/adena/frame-screen-saver"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="containers/docker-compose.yml"
ENV_FILE="$INSTALL_DIR/.env"

# ─── Prerequisites ────────────────────────────────────────────────────────────
install_if_missing() {
  local pkg="$1"
  if ! command -v "$pkg" &>/dev/null; then
    echo "Installing $pkg..."
    sudo apt-get update -qq
    sudo apt-get install -y "$pkg"
  fi
}

install_if_missing git
install_if_missing curl

if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  sudo apt-get update -qq
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# ─── Clone or pull ────────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "Repo found — pulling latest on branch '$BRANCH'..."
  git -C "$INSTALL_DIR" fetch origin
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  echo "Cloning repository into $INSTALL_DIR..."
  sudo git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  sudo chown -R "$USER":"$USER" "$INSTALL_DIR"
fi

# ─── Secrets / env vars ───────────────────────────────────────────────────────
# API keys are passed to the container via a .env file at $INSTALL_DIR/.env
# The file is never committed to git (it's in .gitignore).
#
# Supported variables:
#   PRIM_API_KEY   — Île-de-France Mobilités SIRI Stop Monitoring
#   NAVITIA_TOKEN  — Navitia.io API token
#
# On first run the script creates the file; on subsequent runs it only adds
# missing keys (existing values are preserved).

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

add_env_key() {
  local key="$1"
  local current_val="${!key:-}"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    echo "  $key already set in $ENV_FILE — skipping."
  elif [[ -n "$current_val" ]]; then
    echo "${key}=${current_val}" >> "$ENV_FILE"
    echo "  $key written to $ENV_FILE from environment."
  else
    read -rsp "  $key (leave empty to skip): " val; echo
    if [[ -n "$val" ]]; then
      echo "${key}=${val}" >> "$ENV_FILE"
      echo "  $key saved."
    else
      echo "  $key skipped."
    fi
  fi
}

echo ""
echo "─── API key setup ──────────────────────────────────────────────────────"
add_env_key PRIM_API_KEY
add_env_key NAVITIA_TOKEN

# ─── Build and start ──────────────────────────────────────────────────────────
echo ""
echo "Building and starting containers..."
sudo --preserve-env \
  docker compose \
    --env-file "$ENV_FILE" \
    -f "$INSTALL_DIR/$COMPOSE_FILE" \
    up -d --build

echo ""
echo "Done. frame-screen-saver is running on http://$(hostname -I | awk '{print $1}'):4500"
echo ""
echo "Useful commands:"
echo "  View logs:   sudo docker logs -f frame-screen-saver-web"
echo "  Stop:        sudo docker compose -f $INSTALL_DIR/$COMPOSE_FILE down"
echo "  Restart:     sudo docker restart frame-screen-saver-web"
