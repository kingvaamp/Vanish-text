#!/bin/bash
# build.sh — Robust build script for Render
set -e

echo "🚀 Starting Build Process..."

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 2. Clear old build artifacts
echo "🧹 Clearing old builds..."
rm -rf dist web-build

# 3. Run Expo Web Export
echo "🛠️ Exporting Expo Web..."
CI=1 npx expo export -p web

# 4. Verify Output
if [ -d "dist/_expo" ]; then
  echo "✅ Expo export success: dist/_expo folder detected."
elif [ -d "web-build/_expo" ]; then
  echo "⚠️ Note: Expo exported to web-build instead of dist. Moving files..."
  mv web-build/* dist/
  mv web-build/.* dist/ 2>/dev/null || true
  rm -rf web-build
else
  echo "❌ ERROR: Neither dist/_expo nor web-build/_expo found after build!"
  ls -la
  exit 1
fi

echo "✨ Build Complete."
