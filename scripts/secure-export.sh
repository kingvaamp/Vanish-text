#!/bin/bash

# scripts/secure-export.sh
# Un script sécurisé pour exporter le code source de VanishText sans les secrets.

# 1. Nom du fichier d'export
EXPORT_NAME="vanishtext-secure-export.zip"

echo "🔐 Préparation de l'export sécurisé..."

# 2. Utiliser git archive pour ne prendre que les fichiers suivis par git
# Cela garantit que .env.local et node_modules ne seront JAMAIS inclus.
git archive -o "$EXPORT_NAME" HEAD

if [ $? -eq 0 ]; then
  echo "✅ Projet exporté avec succès dans : $EXPORT_NAME"
  echo "ℹ️ Note : Seuls les fichiers committés dans Git sont inclus (Les .env sont exclus)."
else
  echo "❌ Erreur lors de l'export (Vérifiez que vous avez bien committé vos changements)."
fi
