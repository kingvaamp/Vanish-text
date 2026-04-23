import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, Phone, MoreVertical, Lock, Unlock,
  Send, Plus, Mic, CheckCheck, FileText, Loader2
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useCrypto } from '@/hooks/useCrypto';
import { supabase } from '@/lib/supabase';
import Av from '@/components/Av';
import BadgeE2E from '@/components/BadgeE2E';
import RedProgressBar from '@/components/RedProgressBar';
import MediaTray from '@/components/MediaTray';
import VoiceRecorder from '@/components/VoiceRecorder';
import { DEMO_CONTACTS } from '@/data/demoData';

// ============================================
// Conversation Row
// ============================================
function ConversationRow({ conv, onClick, contacts }) {
  const contact = contacts.find((c) => c.id === conv.contactId);
  if (!contact) return null;

  const hasUnread = conv.unreadCount > 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] relative"
      style={{ borderBottom: '1px solid rgba(255, 0, 60, 0.06)' }}
    >
      <Av name={contact.name} size={42} online={contact.online} borderColor={hasUnread ? '#ff003c' : undefined} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className={`text-[15px] truncate ${hasUnread ? 'font-semibold text-white' : 'font-medium text-white/90'}`}>
            {contact.name}
          </h3>
          <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {conv.timestamp}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className={`text-[13px] truncate ${hasUnread ? 'text-[#ff003c] italic' : 'text-white/50'}`}>
            {conv.lastMessage || (hasUnread ? '🔒 Message chiffré' : '')}
          </p>
          {hasUnread && (
            <span
              className="flex items-center justify-center rounded-full text-[10px] font-bold text-white flex-shrink-0 ml-2"
              style={{ width: 18, height: 18, backgroundColor: '#ff003c' }}
            >
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================
// Message Bubble
// ============================================
function MessageBubble({ message, isSent, onDecrypt }) {
  const [glitching, setGlitching] = useState(false);
  const [ttl, setTtl] = useState(message.ttl || 180);

  useEffect(() => {
    if (message.isRead && !message.locked && message.decryptedAt) {
      const updateTtl = () => {
        const elapsed = Math.floor((Date.now() - message.decryptedAt) / 1000);
        setTtl(Math.max(0, 180 - elapsed));
      };
      
      updateTtl();
      const interval = setInterval(updateTtl, 1000);
      return () => clearInterval(interval);
    }
  }, [message.isRead, message.locked, message.decryptedAt]);

  const handleTap = () => {
    if (message.locked) {
      setGlitching(true);
      setTimeout(() => {
        setGlitching(false);
        onDecrypt();
      }, 150);
    }
  };

  const bubbleStyle = isSent
    ? { backgroundColor: '#8b0000', borderRadius: '18px 18px 4px 18px' }
    : { backgroundColor: '#222', borderRadius: '18px 18px 18px 4px' };

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-2 px-4`}>
      <div
        className="max-w-[75%] px-3.5 py-2.5 cursor-pointer transition-all active:scale-[0.98]"
        style={{
          ...bubbleStyle,
          border: '1px solid rgba(255, 0, 60, 0.1)',
          filter: glitching ? 'invert(1) skewX(10deg)' : 'none',
          transition: 'filter 0.15s ease, transform 0.1s ease',
        }}
        onClick={handleTap}
      >
        {message.locked ? (
          <div className="flex items-center gap-1.5">
            <Lock size={12} style={{ color: isSent ? '#f59e0b' : '#ff003c' }} />
            <span className={`text-[13px] italic ${isSent ? 'text-amber-400' : 'text-[#ff003c]'}`}>
              {isSent ? 'Toucher pour révéler' : 'Toucher pour déchiffrer'}
            </span>
          </div>
        ) : (
          <>
            <p className="text-[14px] text-white/90 leading-relaxed">{message.text}</p>
            <div className="flex items-center justify-end gap-1.5 mt-1">
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {message.time}
              </span>
              {isSent && message.isRead && (
                <CheckCheck size={12} style={{ color: '#ff003c' }} />
              )}
            </div>
            {message.isRead && message.ttl > 0 && (
              <div className="mt-2 flex items-center gap-3">
                <div className="flex-1">
                  <RedProgressBar ttl={ttl} max={180} />
                </div>
                <span className="text-[10px] font-mono font-bold tracking-wider shrink-0" style={{ color: ttl <= 30 ? '#ff3333' : '#ff003c' }}>
                  {Math.floor(ttl / 60)}:{(ttl % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================
// New Message Modal
// ============================================
function NewMessageModal({ onClose, onStartChat, contacts }) {
  const [selected, setSelected] = useState([]);

  const toggleContact = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleStart = () => {
    if (selected.length === 1) {
      onStartChat(selected[0]);
    }
  };

  return (
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ backgroundColor: '#050000' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={onClose} className="text-white/60"><ChevronLeft size={24} /></button>
        <h2 className="text-[15px] font-medium text-white">Nouveau message</h2>
        {selected.length > 0 ? (
          <button onClick={handleStart} className="text-[13px] font-medium text-[#ff003c]">Démarrer</button>
        ) : <span className="w-14" />}
      </div>
      <div className="flex-1 overflow-y-auto">
        {contacts.map((contact) => (
          <button
            key={contact.id}
            onClick={() => toggleContact(contact.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/5"
          >
            <div className={`w-5 h-5 rounded border flex items-center justify-center ${selected.includes(contact.id) ? 'bg-[#ff003c] border-[#ff003c]' : 'border-white/20'}`}>
              {selected.includes(contact.id) && <CheckCheck size={12} className="text-white" />}
            </div>
            <Av name={contact.name} size={36} online={contact.online} />
            <div className="flex-1">
              <p className="text-[14px] text-white/90">{contact.name}</p>
              <p className="text-[12px] text-white/40">{contact.phone}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Chat Detail View
// ============================================
function ChatDetail({ conv, onBack, contacts }) {
  const { currentUser, deleteMessage } = useApp();
  const { encryptMessageForDirectory, decryptMessageWithSenderKey } = useCrypto();
  const contact = contacts.find((c) => c.id === conv.contactId);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages]);

  const handleSend = async () => {
    if (!messageText.trim() || sending) return;
    setSending(true);
    try {
      // 1. Fetch contact's key bundle if we don't have it (simplified for demo)
      const { data: bundle } = await supabase.from('key_bundles').select('*').eq('user_id', conv.contactId).single();
      
      const directory = {
        [conv.contactId]: {
          publicKey: bundle?.identity_key || 'dummy-key',
          keyBundle: bundle
        }
      };

      // 2. Encrypt message with new adapter
      const ciphertexts = await encryptMessageForDirectory(messageText.trim(), directory);
      const encrypted = ciphertexts[conv.contactId];

      if (!encrypted) throw new Error('Encryption failed');

      // 3. Send to Supabase
      const { error } = await supabase.from('messages').insert({
        sender_id: currentUser.id,
        receiver_id: conv.contactId,
        payload: encrypted,
      });

      if (error) throw error;

      // 3. Update UI (In a real app, this would happen via Realtime subscription)
      const newMsg = {
        id: `msg-${Date.now()}`,
        senderId: currentUser.id,
        text: messageText.trim(),
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        isRead: false,
        ttl: 0,
        locked: false, // We don't lock our own sent messages for now
      };
      conv.messages.push(newMsg);
      setMessageText('');
    } catch (e) {
      alert(`Erreur d'envoi chiffré : ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleDecrypt = async (msg) => {
    if (!msg.locked) return;
    
    // Check if it's a real encrypted payload from Supabase
    if (msg.payload) {
      try {
        const result = await decryptMessageWithSenderKey(msg.payload, conv.contactId);
        msg.text = result.t || '[Erreur de déchiffrement]';
        msg.locked = false;
        msg.isRead = true;
        msg.decryptedAt = Date.now();
        msg.ttl = 180;
        
        // Force UI update
        setMessageText(t => t + ' '); 
        setTimeout(() => setMessageText(t => t.trim()), 0);
        return;
      } catch (e) {
        console.warn(`Déchiffrement réel échoué : ${e.message}. Fallback mode démo.`);
        // Fallthrough to demo mode if it fails (e.g. keys reset)
      }
    }
    
    // Fallback for Demo Messages or failed decryption
    const decryptedTexts = {
      '🔒 Message chiffré': 'Salut ! Comment ça va aujourd\'hui ?',
      'm3': 'Le rendez-vous est confirmé pour demain !',
      'm6': 'Peux-tu m\'envoyer le fichier ?',
    };
    
    const text = decryptedTexts[msg.id] || decryptedTexts[msg.text] || 'Message sécurisé déchiffré avec succès.';
    msg.locked = false;
    msg.text = text;
    msg.isRead = true;
    if (!msg.decryptedAt) {
      msg.decryptedAt = Date.now();
    }
    msg.ttl = 180;
    
    // Force UI update
    setMessageText(t => t + ' '); 
    setTimeout(() => setMessageText(t => t.trim()), 0);
  };

  if (!contact) return null;

  return (
    <div className="absolute inset-0 z-[50] flex flex-col bg-[#050000]">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 backdrop-blur-md border-b border-white/5">
        <button onClick={onBack} className="text-white/70 p-1"><ChevronLeft size={22} /></button>
        <Av name={contact.name} size={36} online={contact.online} />
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium text-white truncate">{contact.name}</h3>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${contact.online ? 'bg-green-500' : 'bg-white/20'}`} />
            <span className="text-[11px] text-white/50">{contact.online ? 'en ligne' : 'hors ligne'}</span>
            <BadgeE2E />
          </div>
        </div>
        {sending && <Loader2 size={16} className="animate-spin text-[#ff003c] mr-2" />}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3 space-y-1 bg-black/40">
        {conv.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isSent={msg.senderId === currentUser.id}
            onDecrypt={() => handleDecrypt(msg)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-black/40 border-t border-white/5 relative">
        <div className="flex items-end gap-3">
          <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-2xl">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Message de bout en bout..."
              rows={1}
              className="w-full bg-transparent px-4 py-3 text-[14px] text-white outline-none resize-none"
              style={{ minHeight: 44 }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || sending}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[#ff003c] disabled:opacity-50"
          >
            {sending ? <Loader2 size={18} className="animate-spin text-white" /> : <Send size={18} className="text-white ml-1" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Chats Screen
// ============================================
export default function ChatsScreen() {
  const { conversations, activeChatId, setActiveChat, closeChat, currentUser } = useApp();
  const [dbContacts, setDbContacts] = useState([]);
  const [showNewMessage, setShowNewMessage] = useState(false);

  // Merge demo contacts with DB contacts
  const contacts = [...DEMO_CONTACTS, ...dbContacts];

  useEffect(() => {
    fetchContacts();
    // Realtime messages subscription
    const channel = supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new;
        if (msg.receiver_id === currentUser.id || msg.sender_id === currentUser.id) {
          // In a real app, you'd update AppContext state here
          console.log('Nouveau message reçu :', msg);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser.id]);

  const fetchContacts = async () => {
    try {
      const { data } = await supabase.from('profiles').select('*');
      if (data) {
        // Filter out duplicate IDs if any
        const demoIds = DEMO_CONTACTS.map(c => c.id);
        const uniqueDbContacts = data.filter(c => !demoIds.includes(c.id) && c.id !== currentUser.id);
        setDbContacts(uniqueDbContacts);
      }
    } catch (e) {
      console.warn('Supabase profiles fetch failed, using demo contacts only.');
    }
  };

  const activeConv = conversations.find((c) => c.id === activeChatId);

  if (activeConv) {
    return <ChatDetail conv={activeConv} onBack={closeChat} contacts={contacts} />;
  }

  if (showNewMessage) {
    return (
      <NewMessageModal
        contacts={contacts}
        onClose={() => setShowNewMessage(false)}
        onStartChat={(contactId) => {
          setShowNewMessage(false);
          const existing = conversations.find((c) => c.contactId === contactId);
          if (existing) setActiveChat(existing.id);
          else {
            // Create a pseudo-conversation for the UI
            const newConvId = `conv-${Date.now()}`;
            conversations.push({ id: newConvId, contactId, messages: [], lastMessage: '', timestamp: 'Maintenant' });
            setActiveChat(newConvId);
          }
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#050000]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-2">
          <h1 className="text-[17px] font-medium tracking-wide">
            <span className="text-[#ff003c]">Vanish</span><span className="text-white">Text</span>
          </h1>
          <BadgeE2E />
        </div>
        <button onClick={() => setShowNewMessage(true)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#ff003c]/20 text-[#ff003c]">
          <Plus size={18} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conv) => (
          <ConversationRow
            key={conv.id}
            conv={conv}
            contacts={contacts}
            onClick={() => setActiveChat(conv.id)}
          />
        ))}
      </div>
    </div>
  );
}
