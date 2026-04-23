import React, { useState, useEffect } from 'react';
import {
  Smartphone, Key, Info, LogOut, Trash2,
  Shield, Eye, Fingerprint, Bell, Volume2,
  ChevronRight, Edit3, RefreshCw, Copy, CheckCircle
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { generateX3DHBundle, generateIdentityKeyPair } from '@/crypto/x3dh';
import { saveIdentityKey, loadIdentityKey, wipeAllKeys } from '@/crypto/keyStorage';
import { Preferences } from '@capacitor/preferences';
import { Clipboard } from '@capacitor/clipboard';
import Av from '@/components/Av';
import Tog from '@/components/Tog';

const SECURITY_ITEMS = [
  { key: 'blockScreenshots', label: 'Bloquer les captures', desc: 'Empêcher les captures dans les chats', icon: Shield },
  { key: 'readReceipts', label: 'Accusés de lecture', desc: 'Alerter quand le message est ouvert', icon: Eye },
  { key: 'faceIdLock', label: 'Verrou Face ID', desc: 'Requis à l\'ouverture', icon: Fingerprint },
  { key: 'screenshotAlerts', label: 'Alertes captures', desc: 'Notifier quand un contact capture', icon: Bell },
  { key: 'notificationSounds', label: 'Sons de notification', desc: 'Son pour nouveaux messages', icon: Volume2 },
];

export default function ProfileScreen() {
  const { currentUser, securitySettings, updateSecurity, stats = { messages: 142, chats: 12, calls: 3 } } = useApp();
  const { signOut } = useAuth();
  
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [keyBundle, setKeyBundle] = useState(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadKeyStatus();
    countSessions();
  }, []);

  const loadKeyStatus = async () => {
    try {
      const identityKey = await loadIdentityKey();
      if (identityKey) {
        const { data } = await supabase
          .from('key_bundles')
          .select('*')
          .eq('user_id', currentUser.id)
          .single();
        
        if (data) setKeyBundle(data);
      }
    } catch (e) {
      console.error('Failed to load key status:', e);
    }
  };

  const countSessions = async () => {
    try {
      const { keys } = await Preferences.keys();
      const sessionKeys = keys.filter(k => k.startsWith('vanish_ratchet_'));
      setSessionCount(sessionKeys.length);
    } catch (e) {
      console.error('Failed to count sessions:', e);
    }
  };

  const generateNewKeys = async () => {
    const confirm = window.confirm(
      'Régénérer les clés ?\n\nCela supprimera toutes les sessions existantes. Les autres utilisateurs devront re-vérifier votre code de sécurité.'
    );
    
    if (!confirm) return;

    setLoadingKeys(true);
    try {
      // 1. Wipe existing keys locally
      await wipeAllKeys();
      
      // 2. Clear all sessions from Preferences
      const { keys } = await Preferences.keys();
      const sessionKeys = keys.filter(k => k.startsWith('vanish_ratchet_'));
      for (const key of sessionKeys) {
        await Preferences.remove({ key });
      }

      // 3. Generate new identity key pair
      const identityKeyPair = await generateIdentityKeyPair();
      await saveIdentityKey({
        privateJwk: identityKeyPair.privateJwk,
        publicB64: identityKeyPair.publicB64,
      });

      // 4. Generate X3DH bundle (50 One-Time Pre-Keys)
      const bundle = await generateX3DHBundle(identityKeyPair, Date.now(), 50);
      
      // 5. Store private keys securely in Preferences
      await Preferences.set({
        key: `vanish_spk_${currentUser.id}`,
        value: JSON.stringify({
          privateJwk: bundle._privateSignedPreKey.privateJwk,
          keyId: bundle._privateSignedPreKey.keyId,
        })
      });
      
      for (const k of bundle._privateOneTimePreKeys) {
        await Preferences.set({
          key: `vanish_otpk_${currentUser.id}_${k.keyId}`,
          value: JSON.stringify({
            privateJwk: k.privateJwk,
            keyId: k.keyId,
          })
        });
      }

      // 6. Publish public bundle to Supabase
      const { error } = await supabase.from('key_bundles').upsert({
        user_id: currentUser.id,
        identity_key: bundle.identityKey.publicB64,
        signed_pre_key: bundle.signedPreKey,
        one_time_pre_keys: bundle.oneTimePreKeys,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      setKeyBundle(bundle);
      setSessionCount(0);
      alert('Succès : Nouvelles clés X3DH générées et publiées.');
    } catch (e) {
      alert(`Erreur de génération : ${e.message}`);
    } finally {
      setLoadingKeys(false);
    }
  };

  const copyPublicKey = async () => {
    const pubKey = keyBundle?.identity_key || keyBundle?.identityKey?.publicB64;
    if (pubKey) {
      await Clipboard.write({ string: pubKey });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetAllSessions = async () => {
    const confirm = window.confirm('Réinitialiser toutes les sessions Double Ratchet ?');
    if (!confirm) return;

    try {
      const { keys } = await Preferences.keys();
      const sessionKeys = keys.filter(k => k.startsWith('vanish_ratchet_'));
      for (const key of sessionKeys) {
        await Preferences.remove({ key });
      }
      setSessionCount(0);
      alert('Toutes les sessions ont été réinitialisées.');
    } catch (e) {
      alert(`Erreur : ${e.message}`);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-24" style={{ scrollbarWidth: 'none' }}>
      {/* Header with enhanced avatar */}
      <div className="flex flex-col items-center pt-10 pb-8 px-4">
        <div className="relative group cursor-pointer transition-transform active:scale-95">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#ff003c] to-transparent opacity-50 blur-md group-hover:opacity-70 transition-opacity" />
          <div className="relative p-1 rounded-full bg-gradient-to-tr from-[#ff003c]/80 to-white/10 backdrop-blur-md">
            <div className="bg-black/40 p-1 rounded-full">
              <Av name={currentUser.name} size={84} online={false} />
            </div>
          </div>
          <button
            className="absolute bottom-0 right-0 flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-90"
            style={{ width: 30, height: 30, backgroundColor: '#ff003c', border: '2px solid rgba(0,0,0,0.8)' }}
          >
            <Edit3 size={14} className="text-white" />
          </button>
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-white/95 mt-5">{currentUser.name}</h2>
        <p className="text-[14px] font-medium mt-1 tracking-wide text-white/50">{currentUser.phone}</p>
        
        <div className="flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
          <Shield size={10} className="text-[#ff003c]" />
          <p className="text-[10px] uppercase font-bold tracking-widest text-[#ff003c]/90">Protection Active</p>
        </div>
      </div>

      {/* Stats Panel */}
      <div className="mx-4 mb-8">
        <div className="flex items-center justify-around py-5 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-lg">
          <div className="flex flex-col items-center flex-1">
            <span className="text-2xl font-bold text-white/90">{stats.messages}</span>
            <span className="text-[10px] font-medium uppercase tracking-widest mt-1.5 text-white/40">Messages</span>
          </div>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-2xl font-bold text-white/90">{stats.chats}</span>
            <span className="text-[10px] font-medium uppercase tracking-widest mt-1.5 text-white/40">Chats</span>
          </div>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-2xl font-bold text-white/90">{stats.calls}</span>
            <span className="text-[10px] font-medium uppercase tracking-widest mt-1.5 text-white/40">Appels</span>
          </div>
        </div>
      </div>

      {/* Security Management (New X3DH Section) */}
      <div className="px-4 mb-8">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-2 text-white/30">Chiffrement X3DH</h3>
        <div className="rounded-2xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 shadow-lg p-4">
          {keyBundle ? (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Clé d'Identité</span>
                  <button onClick={copyPublicKey} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
                    {copied ? <CheckCircle size={12} className="text-[#00ff88]" /> : <Copy size={12} className="text-white/40" />}
                    <span className="text-[10px] text-white/60">{copied ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>
                <p className="text-[12px] font-mono break-all text-[#00ff88]/80 leading-relaxed">
                  {keyBundle.identity_key || keyBundle.identityKey?.publicB64}
                </p>
              </div>

              <div className="flex items-center justify-between px-1">
                <div className="flex flex-col">
                  <span className="text-[13px] font-medium text-white/90">Sessions Double Ratchet</span>
                  <span className="text-[11px] text-white/40">{sessionCount} sessions actives</span>
                </div>
                {sessionCount > 0 && (
                  <button onClick={resetAllSessions} className="text-[11px] font-bold text-[#ff003c] uppercase tracking-wider hover:opacity-80">Réinitialiser</button>
                )}
              </div>
            </div>
          ) : (
            <div className="py-2 text-center">
              <p className="text-[13px] text-white/40 mb-4">Aucune clé de chiffrement n'est encore générée.</p>
            </div>
          )}

          <button 
            onClick={generateNewKeys}
            disabled={loadingKeys}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#ff003c] text-white font-bold text-[14px] shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loadingKeys ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {keyBundle ? 'Régénérer les clés de sécurité' : 'Générer mon trousseau de clés'}
          </button>
          <p className="text-[10px] text-center mt-3 text-white/20 italic px-4 leading-normal">
            La régénération des clés invalide vos conversations actuelles. À n'utiliser qu'en cas de doute sur la sécurité.
          </p>
        </div>
      </div>

      {/* Security Toggles */}
      <div className="px-4 mb-8">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-2 text-white/30">Paramètres</h3>
        <div className="rounded-2xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 shadow-lg">
          {SECURITY_ITEMS.map((item, i) => (
            <div key={item.key} className={`flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/5 ${i < SECURITY_ITEMS.length - 1 ? 'border-b border-white/5' : ''}`}>
              <div className="p-2 rounded-lg bg-white/5">
                <item.icon size={18} className="text-white/60" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-white/90 tracking-wide">{item.label}</p>
                <p className="text-[12px] text-white/40 mt-0.5">{item.desc}</p>
              </div>
              <div className="pl-2">
                <Tog checked={securitySettings[item.key]} onChange={(v) => updateSecurity({ [item.key]: v })} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="px-4 mb-10">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-2 text-[#ff003c]/60">Zone Critique</h3>
        <div className="rounded-2xl overflow-hidden backdrop-blur-xl bg-[#ff003c]/5 border border-[#ff003c]/20 shadow-lg">
          <button onClick={() => signOut()} className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-[#ff003c]/10 active:scale-[0.99] border-b border-[#ff003c]/10">
            <div className="p-2 rounded-lg bg-[#ff003c]/10"><LogOut size={18} className="text-[#ff003c]" /></div>
            <span className="text-[15px] font-medium text-[#ff003c] tracking-wide">Se déconnecter</span>
          </button>
          <button className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-[#ff003c]/10 active:scale-[0.99]">
            <div className="p-2 rounded-lg bg-[#ff003c]/10"><Trash2 size={18} className="text-[#ff003c]" /></div>
            <span className="text-[15px] font-medium text-[#ff003c] tracking-wide">Supprimer le compte</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8 opacity-60">
        <p className="text-[10px] font-medium tracking-widest uppercase text-white/30">Vanish v2.5 Premium Edition</p>
        <p className="text-[9px] tracking-wider text-[#00ff88]/40 mt-1.5 font-mono">
          X3DH · DOUBLE RATCHET · AES-256-GCM
        </p>
      </div>
    </div>
  );
}
