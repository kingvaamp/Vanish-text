import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, Phone, MoreVertical, Lock, Unlock,
  Send, Plus, Mic, CheckCheck
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import Av from '@/components/Av';
import BadgeE2E from '@/components/BadgeE2E';
import RedProgressBar from '@/components/RedProgressBar';
import MediaTray from '@/components/MediaTray';
import VoiceRecorder from '@/components/VoiceRecorder';
import { DEMO_CONTACTS } from '@/data/demoData';

// ============================================
// Conversation Row
// ============================================
function ConversationRow({ conv, onClick }) {
  const contact = DEMO_CONTACTS.find((c) => c.id === conv.contactId);
  if (!contact) return null;

  const hasUnread = conv.unreadCount > 0;
  const isActive = false;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] relative"
      style={{ borderBottom: '1px solid rgba(255, 0, 60, 0.06)' }}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full" style={{ backgroundColor: '#ff003c' }} />
      )}

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
            {hasUnread ? '🔒 Message chiffré' : conv.lastMessage}
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
function MessageBubble({ message, isSent, onDecrypt, ttl }) {
  const [glitching, setGlitching] = useState(false);

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
              <div className="mt-1.5">
                <RedProgressBar ttl={ttl} max={180} />
                <span className="text-[10px] font-mono mt-0.5 block" style={{ color: '#ff003c' }}>
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
function NewMessageModal({ onClose, onStartChat }) {
  const { contacts } = useApp();
  const [selected, setSelected] = useState([]);

  const toggleContact = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleStart = () => {
    if (selected.length === 1) {
      onStartChat(selected[0]);
    } else if (selected.length > 1) {
      // Broadcast mode
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ backgroundColor: '#050000' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,0,60,0.08)' }}>
        <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-[15px] font-medium text-white">
          {selected.length > 0 ? `${selected.length} contact${selected.length > 1 ? 's' : ''}` : 'Nouveau message'}
        </h2>
        {selected.length > 0 ? (
          <button onClick={handleStart} className="text-[13px] font-medium" style={{ color: '#ff003c' }}>
            {selected.length === 1 ? 'Démarrer' : `Diffuser →`}
          </button>
        ) : (
          <span className="w-14" />
        )}
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {contacts.map((contact) => (
          <button
            key={contact.id}
            onClick={() => toggleContact(contact.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
            style={{ borderBottom: '1px solid rgba(255,0,60,0.04)' }}
          >
            <div
              className="flex items-center justify-center rounded border transition-colors flex-shrink-0"
              style={{
                width: 22,
                height: 22,
                borderColor: selected.includes(contact.id) ? '#ff003c' : 'rgba(255,255,255,0.2)',
                backgroundColor: selected.includes(contact.id) ? '#ff003c' : 'transparent',
              }}
            >
              {selected.includes(contact.id) && (
                <CheckCheck size={14} className="text-white" />
              )}
            </div>
            <Av name={contact.name} size={36} online={contact.online} />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] text-white/90 truncate">{contact.name}</p>
              <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{contact.phone}</p>
            </div>
          </button>
        ))}
      </div>

      {selected.length > 1 && (
        <div className="px-4 py-2 text-center">
          <p className="text-[10px] italic" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Envoyé individuellement · disparaît 3 min après lecture
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Chat Detail View
// ============================================
function ChatDetail({ conv, onBack }) {
  const { contacts, currentUser, deleteMessage } = useApp();
  const contact = contacts.find((c) => c.id === conv.contactId);
  const [messageText, setMessageText] = useState('');
  const [showMedia, setShowMedia] = useState(false);
  const [recording, setRecording] = useState(false);
  const [messageTtls, setMessageTtls] = useState({});
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages]);

  // TTL countdown engine
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageTtls((prev) => {
        const next = { ...prev };
        let changed = false;
        conv.messages.forEach((m) => {
          if (m.isRead && !m.locked && (m.ttl > 0 || next[m.id] > 0)) {
            const current = next[m.id] !== undefined ? next[m.id] : m.ttl;
            if (current > 0) {
              next[m.id] = current - 1;
              changed = true;
            }
            if (current <= 1) {
              deleteMessage(conv.id, m.id);
            }
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [conv.messages, conv.id, deleteMessage]);

  if (!contact) return null;

  const handleSend = () => {
    if (!messageText.trim()) return;
    const newMsg = {
      id: `msg-${Date.now()}`,
      senderId: 'me',
      text: messageText.trim(),
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      ttl: 0,
      locked: true,
    };
    // Add to conversation via dispatch
    // For demo, we'll mutate locally
    conv.messages.push(newMsg);
    conv.lastMessage = messageText.trim();
    conv.timestamp = newMsg.time;
    setMessageText('');
  };

  const handleDecrypt = (msg) => {
    // In real app, this would call the crypto module
    // For demo, we reveal a predefined text
    const decryptedTexts = {
      '🔒 Message chiffré': 'Salut ! Comment ça va aujourd\'hui ?',
      'm3': 'Le rendez-vous est confirmé pour demain !',
      'm6': 'Peux-tu m\'envoyer le fichier ?',
    };
    const text = decryptedTexts[msg.id] || decryptedTexts[msg.text] || 'Message déchiffré avec succès.';
    msg.locked = false;
    msg.text = text;
    msg.isRead = true;
    msg.ttl = 180;
    setMessageTtls((prev) => ({ ...prev, [msg.id]: 180 }));
  };

  return (
    <div className="absolute inset-0 z-[50] flex flex-col" style={{ backgroundColor: '#050000' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 flex-shrink-0"
        style={{
          backgroundColor: 'rgba(5, 0, 0, 0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 0, 60, 0.08)',
        }}
      >
        <button onClick={onBack} className="text-white/70 hover:text-white transition-colors p-1">
          <ChevronLeft size={22} />
        </button>

        <Av name={contact.name} size={36} online={contact.online} />

        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium text-white truncate">{contact.name}</h3>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>en ligne</span>
            <BadgeE2E />
          </div>
        </div>

        <button className="text-white/50 hover:text-white transition-colors p-2">
          <Phone size={18} />
        </button>
        <button className="text-white/50 hover:text-white transition-colors p-2">
          <MoreVertical size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3 space-y-1" style={{ backgroundColor: 'rgba(5, 0, 0, 0.6)' }}>
        {conv.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isSent={msg.senderId === 'me'}
            onDecrypt={() => handleDecrypt(msg)}
            ttl={messageTtls[msg.id] !== undefined ? messageTtls[msg.id] : msg.ttl}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative flex-shrink-0">
        <MediaTray open={showMedia} onSelect={(type) => { setShowMedia(false); }} />

        {recording ? (
          <VoiceRecorder
            onCancel={() => setRecording(false)}
            onSend={() => setRecording(false)}
          />
        ) : (
          <div
            className="flex items-end gap-2 px-3 py-2"
            style={{
              backgroundColor: 'rgba(5, 0, 0, 0.9)',
              borderTop: '1px solid rgba(255, 0, 60, 0.06)',
            }}
          >
            <button
              onClick={() => setShowMedia(!showMedia)}
              className="flex-shrink-0 p-2 text-white/40 hover:text-white/70 transition-colors"
            >
              <Plus size={22} />
            </button>

            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value.slice(0, 500))}
              placeholder="Vanish message..."
              rows={1}
              className="flex-1 bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder:text-white/25 outline-none resize-none max-h-[80px]"
              style={{ minHeight: 36 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />

            {messageText.trim() ? (
              <button
                onClick={handleSend}
                className="flex-shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-90"
                style={{ width: 36, height: 36, backgroundColor: '#ff003c' }}
              >
                <Send size={16} className="text-white" />
              </button>
            ) : (
              <button
                onClick={() => setRecording(true)}
                className="flex-shrink-0 p-2 text-white/40 hover:text-[#ff003c] transition-colors"
              >
                <Mic size={22} />
              </button>
            )}
          </div>
        )}

        {messageText.trim() && (
          <div className="absolute -top-5 left-0 right-0 text-center">
            <span className="text-[9px] tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>
              🔒 Signal · a1b2c3d4
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Main Chats Screen
// ============================================
export default function ChatsScreen() {
  const { conversations, activeChatId, setActiveChat, closeChat, toggleUser, currentUser } = useApp();
  const [showNewMessage, setShowNewMessage] = useState(false);

  const activeConv = conversations.find((c) => c.id === activeChatId);

  if (activeConv) {
    return <ChatDetail conv={activeConv} onBack={closeChat} />;
  }

  if (showNewMessage) {
    return (
      <NewMessageModal
        onClose={() => setShowNewMessage(false)}
        onStartChat={(contactId) => {
          setShowNewMessage(false);
          // Find or create conversation
          const existing = conversations.find((c) => c.contactId === contactId);
          if (existing) {
            setActiveChat(existing.id);
          }
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
        <div className="flex items-center gap-2">
          <h1 className="text-[17px] font-medium tracking-wide">
            <span style={{ color: '#ff003c' }}>Vanish</span>
            <span className="text-white">Text</span>
          </h1>
          <BadgeE2E />
        </div>

        <div className="flex items-center gap-2">
          {/* Alice/Bob toggle */}
          <button
            onClick={toggleUser}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors"
            style={{ backgroundColor: 'rgba(255, 0, 60, 0.1)', color: '#ff003c' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#ff003c' }} />
            {currentUser.name}
          </button>

          <button
            onClick={() => setShowNewMessage(true)}
            className="flex items-center justify-center rounded-full transition-colors"
            style={{ width: 32, height: 32, backgroundColor: 'rgba(255, 0, 60, 0.15)' }}
          >
            <Plus size={18} style={{ color: '#ff003c' }} />
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(255, 0, 60, 0.08)' }}>
              <Lock size={24} style={{ color: '#ff003c' }} />
            </div>
            <p className="text-white/60 text-sm mb-2">Aucune conversation</p>
            <button
              onClick={() => setShowNewMessage(true)}
              className="px-4 py-2 rounded-lg text-sm text-white font-medium"
              style={{ backgroundColor: '#ff003c' }}
            >
              Nouveau message
            </button>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              onClick={() => setActiveChat(conv.id)}
            />
          ))
        )}
      </div>

      {/* Security footer */}
      <div
        className="px-4 py-3 flex-shrink-0 text-center"
        style={{
          borderTop: '1px solid rgba(255, 0, 60, 0.06)',
          backgroundColor: 'rgba(5, 0, 0, 0.6)',
        }}
      >
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: 'rgba(255, 0, 60, 0.05)', border: '1px solid rgba(255, 0, 60, 0.08)' }}
        >
          <Lock size={10} style={{ color: '#ff003c' }} />
          <span className="text-[9px] tracking-wide uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>
            E2E Chiffrement · 3 min TTL · Forward Secrecy
          </span>
        </div>
      </div>
    </div>
  );
}
