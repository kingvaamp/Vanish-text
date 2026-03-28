#!/bin/bash
# build.sh — Robust build script for Render
set -e

echo "🚀 Starting Build Process..."
echo "📍 Working directory: $(pwd)"
echo "🖥️  Node version: $(node --version)"
echo "📦 NPM version: $(npm --version)"

# 1. Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# 2. Clear old build artifacts (ensure fresh build)
echo ""
echo "🧹 Clearing old builds..."
rm -rf dist web-build

# 3. Run Expo Web Export (with memory cap for Render free tier 512MB RAM)
echo ""
echo "🛠️ Exporting Expo Web (with NODE_OPTIONS max_old_space_size=460)..."
NODE_OPTIONS="--max_old_space_size=460" CI=1 npx expo export -p web

echo ""
echo "📂 Listing root directory after build:"
ls -la

# 4. Verify Output
echo ""
if [ -d "dist/_expo" ]; then
  echo "✅ Expo export success: dist/_expo folder detected."
  echo "📂 Contents of dist/:"
  ls -la dist/
elif [ -d "web-build/_expo" ]; then
  echo "⚠️ Expo exported to web-build instead of dist. Moving..."
  cp -r web-build/. dist/
  rm -rf web-build
  echo "✅ Files moved to dist/"
else
  echo "❌ ERROR: Neither dist/_expo nor web-build/_expo found after build!"
  echo "📂 Current directory contents:"
  ls -la
  exit 1
fi

echo ""
echo "✨ Build Complete."
