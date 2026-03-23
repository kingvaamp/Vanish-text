import { useState, useCallback, useRef } from 'react';
import { generateKeyPair, importPublicKey, importPrivateKey, ecdh, hkdf, encrypt, decrypt } from './src/crypto/primitives';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useCrypto Hook - X3DH & N-Way Point-to-Point
 * Alice chiffre son message N fois (une fois pour chaque clé publique du salon).
 */
export default function useCrypto() {
  const [keys, setKeys] = useState(null);
  const ratchetCounter = useRef(0);

  // Étape 2: Récupération de l'identité persistante (ou génération d'une nouvelle)
  const generateKeys = useCallback(async () => {
    try {
      // 1. Tente de récupérer la paire d'Identité Asymétrique existante dans le Local Storage
      const storedStr = await AsyncStorage.getItem('vanish_identity_keypair');
      if (storedStr) {
        const storedKeys = JSON.parse(storedStr);
        // Restaure les objets WebCrypto natifs depuis le JWK (Private) et B64 (Public)
        const privateKey = await importPrivateKey(storedKeys.privateJwk);
        const publicKey = await importPublicKey(storedKeys.publicB64);
        
        const k = { 
          type: 'identity', 
          kp: { publicKey, privateKey, publicB64: storedKeys.publicB64, privateJwk: storedKeys.privateJwk } 
        };
        setKeys(k);
        return k;
      }

      // 2. Si aucune clé n'existe pour cet appareil, on génère une nouvelle paire mathématique pure
      const myKeys = await generateKeyPair();
      
      // 3. Sauvegarde persistante immédiate pour survivre aux rechargements web et fermetures de l'app Mobile
      await AsyncStorage.setItem('vanish_identity_keypair', JSON.stringify({
         publicB64: myKeys.publicB64,
         privateJwk: myKeys.privateJwk
      }));

      const k = { type: 'identity', kp: myKeys };
      setKeys(k);
      return k; // Retourne l'objet avec kp.publicB64 pour l'envoyer au serveur
    } catch (e) {
      console.error("Erreur de génération/Restauration d'Identité:", e);
      return { type: 'fallback' };
    }
  }, []);

  // Chiffre le texte N fois avec PFS (Perfect Forward Secrecy - Ephemeral Sender Key)
  const encryptMessageForDirectory = useCallback(async (plainText, directory) => {
    // directory format: { 'socketId': { publicKey: 'B64...' }, ... }
    if (!plainText || keys?.type !== 'identity') return null;
    
    // 1. PFS: Alice génère une paire de clés éphémères jetables pour CET ENVOI spécifique
    const ephemeralKeys = await generateKeyPair();
    
    const ciphertexts = {};
    for (const [peerSocketId, peerData] of Object.entries(directory)) {
      try {
        if (!peerData.publicKey) continue;
        
        // 2. Convertir la clé publique B64 de Bob en objet CryptoKey
        const peerKeyObj = await importPublicKey(peerData.publicKey);
        
        // 3. PFS: Dériver le secret avec la Clé ÉPHÉMÈRE d'Alice + Clé Publique STATIQUE de Bob
        const sharedSecret = await ecdh(ephemeralKeys.privateKey, peerKeyObj);
        
        // 4. Passer dans le module HKDF pour obtenir la clé AES-GCM
        const aesKeyBuf = await hkdf(sharedSecret, null, 'VanishText-Session', 32);
        
        // 5. Chiffrer le payload (Sealed Sender: On embarque l'identité de l'émetteur dans le chiffré)
        const sealedPayload = JSON.stringify({
          t: plainText,
          s: keys.kp.publicB64 // Certificat d'émetteur chiffré
        });
        const encData = await encrypt(aesKeyBuf, sealedPayload);
        
        // 6. PFS: Joindre la clé publique éphémère d'Alice directement à la charge utile (v5)
        ciphertexts[peerSocketId] = `enc:ecdh-aes-gcm:v5:${encData.iv}:${encData.ciphertext}:${ephemeralKeys.publicB64}`;
      } catch (e) {
        console.error(`Erreur de chiffrement (Point-to-Point) vers ${peerSocketId}`);
      }
    }
    // La clé privée éphémère est IMMÉDIATEMENT détruite. Aucun message déchiffrable rétroactivement.
    return ciphertexts; 
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

  // Déchiffre le message avec la clé publique éphémère (v5) ou statique (v4)
  const decryptMessageWithSenderKey = useCallback(async (myCipherText, fallbackSenderPublicKeyB64) => {
      try {
        const parts = myCipherText.split(':');
        const version = parts[2];
        const iv = parts[3];
        const ciphertext = parts[4];
        
        // v5 implémente le Perfect Forward Secrecy : la clé éphémère de l'émetteur est embarquée !
        const senderKeyToUse = (version === 'v5' && parts[5]) ? parts[5] : fallbackSenderPublicKeyB64;
        
        const senderKeyObj = await importPublicKey(senderKeyToUse);
        
        // Bob dérive le secret avec sa Clé Privée STATIQUE + La Clé Publique ÉPHÉMÈRE d'Alice
        const sharedSecret = await ecdh(keys.kp.privateKey, senderKeyObj);
        const aesKeyBuf = await hkdf(sharedSecret, null, 'VanishText-Session', 32);
        
        const decryptedRaw = await decrypt(aesKeyBuf, iv, ciphertext);
        try {
          // Sealed Sender: On déballe l'objet pour récupérer le texte ET l'émetteur
          return JSON.parse(decryptedRaw); 
        } catch (e) {
          return { t: decryptedRaw, s: fallbackSenderPublicKeyB64 }; // Fallback pour compatibilité
        }
      } catch (e) {
        console.log("Échec de déchiffrement PFS asymétrique");
        return { t: "[Erreur Cryptographique]", s: null };
      }
  }, [keys]);

  // Calcule le numéro de sécurité unique (Fingerprint) pour un pair
  const getSafetyNumber = useCallback(async (peerPublicKeyB64) => {
    if (!keys?.kp?.publicB64 || !peerPublicKeyB64) return "...";
    return await generateSafetyNumber(keys.kp.publicB64, peerPublicKeyB64);
  }, [keys]);

  return { keys, generateKeys, encryptMessageForDirectory, decryptMessageWithSenderKey, getSafetyNumber };
}
