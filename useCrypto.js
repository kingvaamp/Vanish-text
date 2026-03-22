import { useState, useCallback, useRef } from 'react';
import { generateKeyPair, importPublicKey, ecdh, hkdf, encrypt, decrypt } from './src/crypto/primitives';

/**
 * useCrypto Hook - X3DH & N-Way Point-to-Point
 * Alice chiffre son message N fois (une fois pour chaque clé publique du salon).
 */
export default function useCrypto() {
  const [keys, setKeys] = useState(null);
  const ratchetCounter = useRef(0);

  // Étape 2: Génère LA clé d'identité asymétrique unique d'Alice.
  const generateKeys = useCallback(async () => {
    try {
      const myKeys = await generateKeyPair();
      const k = { type: 'identity', kp: myKeys };
      setKeys(k);
      return k; // Retourne l'objet avec kp.publicB64 pour l'envoyer au serveur
    } catch (e) {
      console.error("Erreur de génération d'Identité:", e);
      return { type: 'fallback' };
    }
  }, []);

  // Chiffre le texte N fois pour N destinataires
  const encryptMessageForDirectory = useCallback(async (plainText, directory) => {
    // directory format: { 'socketId': { publicKey: 'B64...' }, ... }
    if (!plainText || keys?.type !== 'identity') return null;
    
    const ciphertexts = {};
    for (const [peerSocketId, peerData] of Object.entries(directory)) {
      try {
        if (!peerData.publicKey) continue;
        
        // 1. Convertir la clé publique B64 de Bob en objet CryptoKey
        const peerKeyObj = await importPublicKey(peerData.publicKey);
        
        // 2. Dériver le secret partagé ECDH (Clé_Privée_Alice + Clé_Publ_Bob)
        const sharedSecret = await ecdh(keys.kp.privateKey, peerKeyObj);
        
        // 3. Passer dans le module HKDF pour obtenir la clé AES-GCM
        const aesKeyBuf = await hkdf(sharedSecret, null, 'VanishText-Session', 32);
        
        // 4. Chiffrer le message pour ce socket spécifiquement
        const encData = await encrypt(aesKeyBuf, plainText);
        ciphertexts[peerSocketId] = `enc:ecdh-aes-gcm:v4:${encData.iv}:${encData.ciphertext}`;
      } catch (e) {
        console.error(`Erreur de chiffrement (Point-to-Point) vers ${peerSocketId}`);
      }
    }
    return ciphertexts; // Renvoie l'objet associatif des N messages chiffrés
  }, [keys]);

  // Déchiffre le message reçu (qui contient un paquet de ciphertexts)
  const decryptMessage = useCallback(async (ciphertextsObj, myId) => {
    if (!ciphertextsObj || typeof ciphertextsObj !== 'object') return null;
    
    // Le serveur transmet un objet comportant un texte chiffré pour CHAQUE socket.
    // On cherche celui qui NOUS est destiné.
    const myCipherText = ciphertextsObj[myId]; 
    if (!myCipherText || !myCipherText.startsWith('enc:')) {
      return "[Message privé non-déchiffrable (Pas de charge utile destinée à votre appareil)]";
    }
    
    try {
      const parts = myCipherText.split(':');
      if (parts.length < 5) return "[Erreur Format Point-to-Point]";
      
      const algo = parts[1];
      if (algo === 'ecdh-aes-gcm' && keys?.type === 'identity') {
        const iv = parts[3];
        const ciphertext = parts[4];
        
        // Attention: Dans un vrai système, l'émetteur joint sa clé publique éphémère.
        // Ici, pour le Proof of Concept, nous avons besoin de la clé publique de l'émetteur
        // pour que Bob (nous) dérive le MÊME secret partagé !
        // -> Nous avons besoin que encryptMessageForDirectory nous envoie qui est l'émetteur
        // ou que la charge utile le contienne.
        // Pour être élégant, nous allons simuler un Broadcast N-Way asymétrique.
        
        // ERREUR conceptuelle: Si Alice chiffre pour Bob, Bob a besoin de la clé PUBLIQUE
        // d'Alice pour combiner avec sa propre clé PRIVÉE.
        // Donc, Bob demande la clé publique d'Alice depuis l'annuaire au niveau du Hook App.js.
        throw new Error("Déchiffrement délégué à l'interface");
      }
    } catch (e) {
      console.error("Erreur décryptage N-Way", e);
      return "[Erreur Cryptographique]";
    }
  }, [keys]);

  // Déchiffre le message avec la clé publique de l'émetteur explicitly fournie
  const decryptMessageWithSenderKey = useCallback(async (myCipherText, senderPublicKeyB64) => {
      try {
        const parts = myCipherText.split(':');
        const iv = parts[3];
        const ciphertext = parts[4];
        
        const senderKeyObj = await importPublicKey(senderPublicKeyB64);
        const sharedSecret = await ecdh(keys.kp.privateKey, senderKeyObj);
        const aesKeyBuf = await hkdf(sharedSecret, null, 'VanishText-Session', 32);
        
        return await decrypt(aesKeyBuf, iv, ciphertext);
      } catch (e) {
        console.log("Échec de déchiffrement asymétrique");
        return "[Erreur]";
      }
  }, [keys]);

  return { keys, generateKeys, encryptMessageForDirectory, decryptMessageWithSenderKey };
}
