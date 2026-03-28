#!/bin/bash
# build.sh — Robust build script for Render

echo "🚀 Starting Build Process..."

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 2. Run Expo Web Export
echo "🛠️ Exporting Expo Web..."
CI=1 npx expo export -p web

# 3. Verify Output
if [ -d "dist/_expo" ]; then
  echo "✅ Expo export success: dist/_expo folder detected."
  ls -R dist/_expo | head -n 20
else
  echo "❌ ERROR: dist/_expo folder NOT found after build!"
  exit 1
fi

echo "✨ Build Complete."
