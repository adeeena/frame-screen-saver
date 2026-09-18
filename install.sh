#!/usr/bin/env bash

set -Eeuo pipefail

readonly REPOSITORY_URL="${REPOSITORY_URL:-https://github.com/adeeena/frame-screen-saver.git}"
readonly REPOSITORY_BRANCH="${REPOSITORY_BRANCH:-main}"
readonly INSTALL_DIR="${INSTALL_DIR:-$HOME/frame-screen-saver}"
readonly COMPOSE_DIR="$INSTALL_DIR/containers"
readonly ENV_FILE="$COMPOSE_DIR/.env"
readonly DATA_DIR="$INSTALL_DIR/runtime-data"
readonly MESSAGES_FILE="$DATA_DIR/messages.json"

log() {
  printf '\n\033[1;32m==> %s\033[0m\n' "$*"
}

fail() {
  printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2
  exit 1
}

on_error() {
  printf '\n\033[1;31mInstallation failed at line %s.\033[0m\n' "$1" >&2
}

trap 'on_error "$LINENO"' ERR

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "This installer supports Linux only."
fi

if [[ "${EUID}" -eq 0 ]]; then
  fail "Run this script as your regular user, not as root. It will use sudo when needed."
fi

if ! command -v sudo >/dev/null 2>&1; then
  fail "sudo is required. Install it, then run this script again."
fi

install_base_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl git
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y ca-certificates curl git
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y ca-certificates curl git
  else
    fail "No supported package manager found. Install ca-certificates, curl, and git manually."
  fi
}

install_docker() {
  local installer

  installer="$(mktemp)"
  curl --fail --silent --show-error --location https://get.docker.com --output "$installer"
  sudo sh "$installer"
  rm -f "$installer"
}

docker_compose() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
  else
    sudo docker compose "$@"
  fi
}

log "Installing required command-line tools"
install_base_packages

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine and Docker Compose"
  install_docker
fi

if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose v2 is unavailable. Install the Docker Compose plugin and retry."
fi

if ! getent group docker >/dev/null 2>&1; then
  sudo groupadd docker
fi

if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  sudo usermod -aG docker "$USER"
  log "Added $USER to the docker group; this run will use sudo for Docker commands"
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Updating existing checkout in $INSTALL_DIR"

  blocked_git_path="$(find "$INSTALL_DIR/.git" -type d ! -writable -print -quit 2>/dev/null || true)"
  if [[ -z "$blocked_git_path" && -e "$INSTALL_DIR/.git/FETCH_HEAD" && ! -w "$INSTALL_DIR/.git/FETCH_HEAD" ]]; then
    blocked_git_path="$INSTALL_DIR/.git/FETCH_HEAD"
  fi
  if [[ -n "$blocked_git_path" ]]; then
    fail "Git metadata is not writable: $blocked_git_path
Repair its ownership, then rerun this installer:
  sudo chown -R \"$USER:$(id -gn)\" \"$INSTALL_DIR\""
  fi

  git -C "$INSTALL_DIR" fetch origin "$REPOSITORY_BRANCH"

  if [[ -n "$(git -C "$INSTALL_DIR" status --porcelain --untracked-files=no)" ]]; then
    fail "Tracked files in $INSTALL_DIR have local changes. Commit or discard them before updating."
  fi

  git -C "$INSTALL_DIR" checkout "$REPOSITORY_BRANCH"
  git -C "$INSTALL_DIR" merge --ff-only "origin/$REPOSITORY_BRANCH"
elif [[ -e "$INSTALL_DIR" ]]; then
  fail "$INSTALL_DIR exists but is not a Git checkout. Move it or set INSTALL_DIR to another path."
else
  log "Cloning repository into $INSTALL_DIR"
  git clone --branch "$REPOSITORY_BRANCH" --single-branch "$REPOSITORY_URL" "$INSTALL_DIR"
fi

if [[ ! -f "$MESSAGES_FILE" ]]; then
  log "Creating persistent message storage"
  mkdir -p "$DATA_DIR"
  if [[ -f "$INSTALL_DIR/media/messages.json" ]]; then
    cp "$INSTALL_DIR/media/messages.json" "$MESSAGES_FILE"
  else
    printf '[]\n' >"$MESSAGES_FILE"
  fi
  chmod 600 "$MESSAGES_FILE"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  log "Creating $ENV_FILE"
  cat >"$ENV_FILE" <<'EOF'
# Add the token required by the transit provider configured in web/src/server.config.ts.
PRIM_API_KEY=
NAVITIA_TOKEN=
EOF
  chmod 600 "$ENV_FILE"
fi

log "Building and starting frame-screen-saver"
docker_compose --project-directory "$COMPOSE_DIR" up --detach --build --remove-orphans

log "Waiting for the application health check"
container_id="$(docker_compose --project-directory "$COMPOSE_DIR" ps --quiet frame-screen-saver-web)"
[[ -n "$container_id" ]] || fail "The application container was not created."

for _ in {1..30}; do
  health="$(sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  case "$health" in
    healthy | running)
      break
      ;;
    unhealthy | exited | dead)
      docker_compose --project-directory "$COMPOSE_DIR" logs --tail 100
      fail "The application container is $health."
      ;;
  esac
  sleep 2
done

health="$(sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
if [[ "$health" != "healthy" && "$health" != "running" ]]; then
  docker_compose --project-directory "$COMPOSE_DIR" logs --tail 100
  fail "The application did not become healthy in time (status: $health)."
fi

host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
host_ip="${host_ip:-localhost}"

log "Installation complete"
printf 'Open http://%s:4500\n' "$host_ip"
printf 'Configuration: %s\n' "$ENV_FILE"
printf 'After logging out and back in, Docker commands will no longer require sudo.\n'