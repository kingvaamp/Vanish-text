import { useState } from 'react';
import {
  Search, MessageCircle, Phone, Video, ChevronLeft,
  UserPlus, Check, Shield, ShieldCheck, Ban
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import Av from '@/components/Av';
import { computeSafetyNumber } from '@/crypto/safetyNumber';

// ============================================
// Contact Detail Sheet
// ============================================
function ContactSheet({ contact, onClose, onMessage, onCall }) {
  const [safetyNumber, setSafetyNumber] = useState('');
  const [verified, setVerified] = useState(false);

  // Generate safety number on mount
  useState(() => {
    const myKey = 'demo-public-key-alice-256-bits-for-testing-purposes-only';
    const theirKey = `demo-public-key-${contact.id}`;
    computeSafetyNumber(myKey, theirKey).then(setSafetyNumber);
  });

  return (
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ backgroundColor: '#050000' }}>
      {/* Header */}
      <div className="flex items-center px-4 py-3" style={{ borderBottom: '1px solid rgba(255,0,60,0.08)' }}>
        <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h2 className="flex-1 text-center text-[15px] font-medium text-white pr-8">Contact</h2>
      </div>

      {/* Profile */}
      <div className="flex flex-col items-center py-8 px-4">
        <Av name={contact.name} size={76} online={contact.online} />
        <h3 className="text-xl font-medium text-white mt-4">{contact.name}</h3>
        <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {contact.phone}
        </p>

        {/* Action buttons */}
        <div className="flex items-center gap-6 mt-6">
          <button
            onClick={onMessage}
            className="flex flex-col items-center gap-1.5"
          >
            <div
              className="flex items-center justify-center rounded-xl"
              style={{ width: 52, height: 52, backgroundColor: '#ff003c' }}
            >
              <MessageCircle size={22} className="text-white" />
            </div>
            <span className="text-[10px] text-white/50">Message</span>
          </button>

          <button onClick={onCall} className="flex flex-col items-center gap-1.5">
            <div
              className="flex items-center justify-center rounded-xl"
              style={{ width: 52, height: 52, backgroundColor: '#22c55e' }}
            >
              <Phone size={22} className="text-white" />
            </div>
            <span className="text-[10px] text-white/50">Appel</span>
          </button>

          <button className="flex flex-col items-center gap-1.5">
            <div
              className="flex items-center justify-center rounded-xl"
              style={{ width: 52, height: 52, backgroundColor: '#3b82f6' }}
            >
              <Video size={22} className="text-white" />
            </div>
            <span className="text-[10px] text-white/50">Vidéo</span>
          </button>
        </div>
      </div>

      {/* Safety Number */}
      <div className="mx-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,0,60,0.06)' }}>
        <div className="flex items-center gap-2 mb-3">
          {verified ? <ShieldCheck size={14} style={{ color: '#22c55e' }} /> : <Shield size={14} style={{ color: '#ff003c' }} />}
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Safety Number
          </span>
          {verified && <span className="text-[10px] ml-auto" style={{ color: '#22c55e' }}>Vérifié</span>}
        </div>
        <p className="text-[13px] font-mono tracking-wider text-center leading-loose" style={{ color: '#ff003c', opacity: 0.8 }}>
          {safetyNumber || 'Chargement…'}
        </p>

        <button
          onClick={() => setVerified(!verified)}
          className="w-full mt-3 py-2 rounded-lg text-[12px] font-medium transition-colors"
          style={{
            backgroundColor: verified ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 0, 60, 0.08)',
            color: verified ? '#22c55e' : '#ff003c',
            border: `1px solid ${verified ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 0, 60, 0.15)'}`,
          }}
        >
          {verified ? (
            <span className="flex items-center justify-center gap-1.5">
              <Check size={12} /> Marqué comme vérifié
            </span>
          ) : (
            'Marquer comme vérifié'
          )}
        </button>
      </div>

      {/* Block */}
      <div className="mt-auto px-4 pb-8">
        <button
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-[13px] font-medium transition-colors"
          style={{ backgroundColor: 'rgba(255, 0, 60, 0.08)', color: '#ff003c' }}
        >
          <Ban size={14} />
          Bloquer le contact
        </button>
      </div>
    </div>
  );
}

// ============================================
// Add Contact Modal
// ============================================
function AddContactModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSave = () => {
    if (!name.trim() || !phone.trim()) return;
    onSave({ name: name.trim(), phone: phone.trim() });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ backgroundColor: '#050000' }}>
      <div className="flex items-center px-4 py-3" style={{ borderBottom: '1px solid rgba(255,0,60,0.08)' }}>
        <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h2 className="flex-1 text-center text-[15px] font-medium text-white pr-8">Nouveau contact</h2>
      </div>

      <div className="flex-1 px-4 pt-6 space-y-5">
        <div>
          <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Nom
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prénom Nom"
            className="w-full bg-white/5 rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-white/20 outline-none"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider mb-2 block" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Téléphone
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+221 77 000 0000"
            type="tel"
            className="w-full bg-white/5 rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-white/20 outline-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={!name.trim() || !phone.trim()}
          className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-30"
          style={{ backgroundColor: '#ff003c' }}
        >
          Enregistrer le contact
        </button>
      </div>
    </div>
  );
}

// ============================================
// Main Contacts Screen
// ============================================
export default function ContactsScreen() {
  const { contacts, contactsFilter, setContactsFilter, addContact, setActiveChat, setTab, startCall } = useApp();
  const [selectedContact, setSelectedContact] = useState(null);
  const [showAddContact, setShowAddContact] = useState(false);

  // Filter contacts
  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(contactsFilter.toLowerCase()) ||
      c.phone.includes(contactsFilter)
  );

  // Group by first letter
  const grouped = filtered.reduce((acc, c) => {
    const letter = c.name[0].toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(c);
    return acc;
  }, {});

  const sortedLetters = Object.keys(grouped).sort();

  const handleMessage = (contact) => {
    setSelectedContact(null);
    setTab('chats');
    // Find or create conversation would go here
  };

  const handleCall = (contact) => {
    setSelectedContact(null);
    startCall({ name: contact.name, contactId: contact.id });
  };

  if (selectedContact) {
    return (
      <ContactSheet
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onMessage={() => handleMessage(selectedContact)}
        onCall={() => handleCall(selectedContact)}
      />
    );
  }

  if (showAddContact) {
    return (
      <AddContactModal
        onClose={() => setShowAddContact(false)}
        onSave={(data) => {
          const newContact = {
            id: `contact-${Date.now()}`,
            ...data,
            online: false,
            avatarColor: '#6b0018',
            initials: data.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
          };
          addContact(newContact);
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{
          backgroundColor: 'rgba(5, 0, 0, 0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 0, 60, 0.08)',
        }}
      >
        <h1 className="text-[17px] font-medium text-white">Contacts</h1>
        <button
          onClick={() => setShowAddContact(true)}
          className="flex items-center justify-center rounded-full"
          style={{ width: 32, height: 32, backgroundColor: 'rgba(255, 0, 60, 0.15)' }}
        >
          <UserPlus size={18} style={{ color: '#ff003c' }} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
          <Search size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            value={contactsFilter}
            onChange={(e) => setContactsFilter(e.target.value)}
            placeholder="Rechercher…"
            className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/20 outline-none"
          />
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {sortedLetters.map((letter) => (
          <div key={letter}>
            {/* Sticky letter header */}
            <div
              className="sticky top-0 px-4 py-1 text-[12px] font-semibold uppercase tracking-wider"
              style={{
                backgroundColor: 'rgba(5, 0, 0, 0.95)',
                color: '#ff003c',
                borderBottom: '1px solid rgba(255, 0, 60, 0.06)',
              }}
            >
              {letter}
            </div>

            {grouped[letter].map((contact) => (
              <div
                key={contact.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: '1px solid rgba(255, 0, 60, 0.03)' }}
              >
                <button
                  onClick={() => setSelectedContact(contact)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <Av name={contact.name} size={40} online={contact.online} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] text-white/90 truncate">{contact.name}</p>
                    <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {contact.phone}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleMessage(contact)}
                    className="p-2 rounded-full transition-colors hover:bg-white/5"
                  >
                    <MessageCircle size={18} style={{ color: '#ff003c' }} />
                  </button>
                  <button
                    onClick={() => handleCall(contact)}
                    className="p-2 rounded-full transition-colors hover:bg-white/5"
                  >
                    <Phone size={18} style={{ color: '#22c55e' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
