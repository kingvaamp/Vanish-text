import {
  Smartphone, Key, Info, LogOut, Trash2,
  Shield, Eye, Fingerprint, Bell, Volume2,
  ChevronRight, Edit3
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import Av from '@/components/Av';
import Tog from '@/components/Tog';

const SECURITY_ITEMS = [
  { key: 'blockScreenshots', label: 'Bloquer les captures', desc: 'Empêcher les captures dans les chats', icon: Shield },
  { key: 'readReceipts', label: 'Accusés de lecture', desc: 'Alerter quand le message est ouvert', icon: Eye },
  { key: 'faceIdLock', label: 'Verrou Face ID', desc: 'Requis à l\'ouverture', icon: Fingerprint },
  { key: 'screenshotAlerts', label: 'Alertes captures', desc: 'Notifier quand un contact capture', icon: Bell },
  { key: 'notificationSounds', label: 'Sons de notification', desc: 'Son pour nouveaux messages', icon: Volume2 },
];

const ACCOUNT_ITEMS = [
  { label: 'Numéro de téléphone', icon: Smartphone, value: '+221 77 999 0000' },
  { label: 'Clé de chiffrement', icon: Key, value: 'Vérifié ✓' },
  { label: 'À propos de VanishText', icon: Info, value: 'v2.0' },
];

export default function ProfileScreen() {
  const { currentUser, securitySettings, updateSecurity, stats = { messages: 142, chats: 12, calls: 3 } } = useApp();
  const { signOut } = useAuth();

  const handleLogout = () => {
    signOut();
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-6" style={{ scrollbarWidth: 'none' }}>
      {/* Header with enhanced avatar */}
      <div className="flex flex-col items-center pt-10 pb-8 px-4">
        <div className="relative group cursor-pointer transition-transform active:scale-95">
          {/* Glowing gradient border effect */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#ff003c] to-transparent opacity-50 blur-md group-hover:opacity-70 transition-opacity" />
          <div className="relative p-1 rounded-full bg-gradient-to-tr from-[#ff003c]/80 to-white/10 backdrop-blur-md">
            <div className="bg-black/40 p-1 rounded-full">
              <Av name={currentUser.name} size={84} online={false} />
            </div>
          </div>
          <button
            className="absolute bottom-0 right-0 flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-90"
            style={{
              width: 30,
              height: 30,
              backgroundColor: '#ff003c',
              border: '2px solid rgba(0,0,0,0.8)',
            }}
          >
            <Edit3 size={14} className="text-white" />
          </button>
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-white/95 mt-5">{currentUser.name}</h2>
        <p className="text-[14px] font-medium mt-1 tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {currentUser.phone}
        </p>
        <div className="flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
          <Shield size={10} style={{ color: '#ff003c' }} />
          <p className="text-[10px] uppercase font-bold tracking-widest text-[#ff003c]/90">
            Privacy First
          </p>
        </div>
      </div>

      {/* Stats - Glassmorphism Panel */}
      <div className="mx-4 mb-8">
        <div className="flex items-center justify-around py-5 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-lg">
          <div className="flex flex-col items-center flex-1">
            <span className="text-2xl font-bold text-white/90 drop-shadow-md">{stats.messages}</span>
            <span className="text-[10px] font-medium uppercase tracking-widest mt-1.5 text-white/40">Messages</span>
          </div>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-2xl font-bold text-white/90 drop-shadow-md">{stats.chats}</span>
            <span className="text-[10px] font-medium uppercase tracking-widest mt-1.5 text-white/40">Chats</span>
          </div>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
          <div className="flex flex-col items-center flex-1">
            <span className="text-2xl font-bold text-white/90 drop-shadow-md">{stats.calls}</span>
            <span className="text-[10px] font-medium uppercase tracking-widest mt-1.5 text-white/40">Appels</span>
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="px-4 mb-8">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-2 text-white/30">
          Sécurité
        </h3>
        <div className="rounded-2xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 shadow-lg">
          {SECURITY_ITEMS.map((item, i) => (
            <div
              key={item.key}
              className={`flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/5 ${
                i < SECURITY_ITEMS.length - 1 ? 'border-b border-white/5' : ''
              }`}
            >
              <div className="p-2 rounded-lg bg-white/5">
                <item.icon size={18} className="text-white/60" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-white/90 tracking-wide">{item.label}</p>
                <p className="text-[12px] text-white/40 mt-0.5">{item.desc}</p>
              </div>
              <div className="pl-2">
                <Tog
                  checked={securitySettings[item.key]}
                  onChange={(v) => updateSecurity({ [item.key]: v })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Account Section */}
      <div className="px-4 mb-8">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-2 text-white/30">
          Compte
        </h3>
        <div className="rounded-2xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 shadow-lg">
          {ACCOUNT_ITEMS.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/5 cursor-pointer active:scale-[0.99] ${
                i < ACCOUNT_ITEMS.length - 1 ? 'border-b border-white/5' : ''
              }`}
            >
              <div className="p-2 rounded-lg bg-white/5">
                <item.icon size={18} className="text-white/60" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-white/90 tracking-wide">{item.label}</p>
              </div>
              <span className="text-[13px] font-medium text-white/40">
                {item.value}
              </span>
              <ChevronRight size={16} className="text-white/20" />
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="px-4 mb-10">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-2 text-[#ff003c]/60">
          Zone de Danger
        </h3>
        <div className="rounded-2xl overflow-hidden backdrop-blur-xl bg-[#ff003c]/5 border border-[#ff003c]/20 shadow-[0_4px_20px_rgba(255,0,60,0.05)]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-4 text-left transition-all hover:bg-[#ff003c]/10 active:scale-[0.99] border-b border-[#ff003c]/10"
          >
            <div className="p-2 rounded-lg bg-[#ff003c]/10">
              <LogOut size={18} className="text-[#ff003c]" />
            </div>
            <span className="text-[15px] font-medium text-[#ff003c] tracking-wide">Se déconnecter</span>
          </button>
          <button className="w-full flex items-center gap-4 px-4 py-4 text-left transition-all hover:bg-[#ff003c]/10 active:scale-[0.99]">
            <div className="p-2 rounded-lg bg-[#ff003c]/10">
              <Trash2 size={18} className="text-[#ff003c]" />
            </div>
            <span className="text-[15px] font-medium text-[#ff003c] tracking-wide">Supprimer le compte</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8 opacity-60">
        <p className="text-[10px] font-medium tracking-widest uppercase text-white/30">
          VanishText v2.0
        </p>
        <p className="text-[9px] tracking-wider text-white/20 mt-1.5">
          Signal Protocol X3DH · Double Ratchet · AES-256-GCM
        </p>
      </div>
    </div>
  );
}

