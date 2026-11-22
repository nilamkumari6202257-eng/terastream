#!/bin/bash
# TeraStream deployment build script (platform convention).
# Packages the built app + Node server + Caddy gateway into a deployable tarball.
exec 2>&1
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

BUILD_ID="${BUILD_ID:-manual}"
BUILD_DIR="/tmp/build_fullstack_$BUILD_ID"

echo "== TeraStream build (id: $BUILD_ID) =="

# 1. (Re)build the frontend bundle if missing
if [ ! -f dist/index.html ]; then
  echo "dist/ missing - building frontend..."
  npm run build
fi

# 2. Assemble the deployment package
echo "Assembling package in $BUILD_DIR..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/app"

# App: server code, built frontend, public assets, data store
cp -r server dist public data "$BUILD_DIR/app/"
# Runtime config (admin password etc.)
cp .env "$BUILD_DIR/app/.env"

# Gateway: same convention as the standard stack (:81 -> localhost:3000)
cat > "$BUILD_DIR/Caddyfile" <<'EOF'
:81 {
        @transform_port_query {
                query XTransformPort=*
        }
        handle @transform_port_query {
                reverse_proxy localhost:{query.XTransformPort} {
                        header_up Host {host}
                        header_up X-Forwarded-For {remote_host}
                        header_up X-Forwarded-Proto {scheme}
                        header_up X-Real-IP {remote_host}
                }
        }
        handle {
                reverse_proxy localhost:3000 {
                        header_up Host {host}
                        header_up X-Forwarded-For {remote_host}
                        header_up X-Forwarded-Proto {scheme}
                        header_up X-Real-IP {remote_host}
                }
        }
}
EOF

# Entrypoint: start Node server, then run Caddy in the foreground
cat > "$BUILD_DIR/start.sh" <<'EOF'
#!/bin/sh
set -e
cd "$(dirname "$0")"
echo "Starting TeraStream server..."
(
  cd app
  export NODE_ENV=production
  export PORT=3000
  if command -v node >/dev/null 2>&1; then
    node server/index.mjs &
  else
    bun server/index.mjs &
  fi
  SRV_PID=$!
  echo "Server PID: $SRV_PID"
)
# Wait for the app to come up (max ~30s)
i=0
while [ $i -lt 30 ]; do
  if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    echo "Health check passed"
    break
  fi
  sleep 1
  i=$((i+1))
done
echo "Starting Caddy gateway..."
exec caddy run --config Caddyfile --adapter caddyfile
EOF
chmod +x "$BUILD_DIR/start.sh"

# 3. Package
PACKAGE_FILE="${BUILD_DIR}.tar.gz"
echo "Packaging to $PACKAGE_FILE..."
cd "$BUILD_DIR"
tar -czf "$PACKAGE_FILE" .
cd "$PROJECT_DIR"

echo "Package size:"
ls -lh "$PACKAGE_FILE"
echo "BUILD_OK $PACKAGE_FILE"
