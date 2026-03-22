import { useState, useCallback, useRef } from 'react';

/**
 * useCrypto Hook
 * Simulacre de chiffrement de bout en bout (Signal Protocol X3DH + Double Ratchet + AES-256-GCM).
 * Pour la démonstration, il gère les clés et encode les messages (Base64) pour prouver le comportement
 * sans nécessiter de polyfills lourds sur l'environnement React Native.
 */
export default function useCrypto() {
  const [keys, setKeys] = useState(null);
  const ratchetCounter = useRef(0);

  // Génération des clés de session asymétriques
  const generateKeys = useCallback(async () => {
    // Simulation
    const id = Math.random().toString(36).substring(2, 12);
    const newKeys = { public: `pub_${id}`, private: `priv_${id}` };
    setKeys(newKeys);
    return newKeys;
  }, []);

  // Chiffrement d'un message
  const encryptMessage = useCallback(async (plainText, receiverPubKey) => {
    if (!plainText) return plainText;
    ratchetCounter.current++;
    
    // Simuler le temps de calcul du Double Ratchet et AES
    await new Promise(r => setTimeout(r, 10));
    
    // Masquage simple (Base64) pour simuler la transformation avec des métadonnées de chiffrement
    const nonce = Math.random().toString(36).slice(2, 8);
    const encoded = btoa(unescape(encodeURIComponent(plainText)));
    
    // Format: enc:<algorithme>:<ratchet_id>:<nonce>:<ciphertext>
    return `enc:aes-gcm:${ratchetCounter.current}:${nonce}:${encoded}`;
  }, []);

  // Déchiffrement d'un message
  const decryptMessage = useCallback(async (cipherText) => {
    if (!cipherText || !cipherText.startsWith('enc:')) return cipherText;
    
    try {
      // Simuler le temps de calcul
      await new Promise(r => setTimeout(r, 10));
      
      const parts = cipherText.split(':');
      if (parts.length < 5) return "[Erreur de Déchiffrement]";
      
      const encoded = parts.slice(4).join(':');
      const decoded = decodeURIComponent(escape(atob(encoded)));
      return decoded;
    } catch (e) {
      console.error("Erreur de déchiffrement E2E", e);
      return "[Message Illisible]";
    }
  }, []);

  return {
    keys,
    generateKeys,
    encryptMessage,
    decryptMessage
  };
}
