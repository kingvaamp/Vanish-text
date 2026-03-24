#!/bin/bash
# scripts/export-safe.sh
# Export sécurisé du code source — sans secrets ni artefacts de build
set -e

OUTPUT="vanishtext-export-$(date +%Y%m%d).zip"

zip -r "$OUTPUT" . \
  --exclude "*.env*" \
  --exclude ".env.local" \
  --exclude "node_modules/*" \
  --exclude "server/node_modules/*" \
  --exclude ".git/*" \
  --exclude "*.DS_Store" \
  --exclude "*.pem" \
  --exclude "*.key" \
  --exclude "*.p12" \
  --exclude "*.mobileprovision" \
  --exclude "dist/*"

echo "✅ Export sécurisé créé : $OUTPUT"
echo "⚠️  Vérifier manuellement qu'aucune clé n'est incluse avant de partager"
