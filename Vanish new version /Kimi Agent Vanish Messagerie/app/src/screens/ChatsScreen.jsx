import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, Phone, MoreVertical, Lock, Unlock,
  Send, Plus, Mic, CheckCheck, FileText
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
            {message.attachment ? (
              <div className="flex flex-col gap-2">
                {message.attachment.type === 'image' && (
                  <img src={message.attachment.url} alt={message.attachment.name} className="rounded-xl max-w-full object-cover" style={{ maxHeight: 200 }} />
                )}
                {message.attachment.type === 'video' && (
                  <video src={message.attachment.url} controls className="rounded-xl max-w-full" style={{ maxHeight: 200 }} />
                )}
                {message.attachment.type === 'file' && (
                  <div className="flex items-center gap-2 p-2 bg-black/20 rounded-lg">
                    <FileText size={20} className="text-[#ff003c]" />
                    <span className="text-[13px] text-white/90 truncate max-w-[150px]">{message.attachment.name}</span>
                  </div>
                )}
                {message.text && <p className="text-[14px] text-white/90 leading-relaxed mt-1">{message.text}</p>}
              </div>
            ) : (
              <p className="text-[14px] text-white/90 leading-relaxed">{message.text}</p>
            )}
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
                <span className="text-[10px] font-mono font-bold tracking-wider shrink-0" style={{ color: ttl <= 30 ? '#ff3333' : '#ff003c', animation: ttl <= 30 ? 'ttl-pulse 0.5s infinite alternate' : 'none' }}>
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
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [fileAccept, setFileAccept] = useState('*/*');

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages]);

  // TTL countdown engine
  useEffect(() => {
    const interval = setInterval(() => {
      conv.messages.forEach((m) => {
        if (m.isRead && !m.locked && m.decryptedAt) {
          const elapsed = Math.floor((Date.now() - m.decryptedAt) / 1000);
          if (elapsed >= 180) {
            deleteMessage(conv.id, m.id);
          }
        }
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

  const handleMediaSelect = (type) => {
    setShowMedia(false);
    let accept = '*/*';
    if (type === 'photo') accept = 'image/*';
    else if (type === 'video') accept = 'video/*';
    else if (type === 'camera') accept = 'image/*,video/*;capture=camera';
    
    setFileAccept(accept);
    setTimeout(() => {
      if (fileInputRef.current) fileInputRef.current.click();
    }, 50);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let attachType = 'file';
    if (file.type.startsWith('image/')) attachType = 'image';
    else if (file.type.startsWith('video/')) attachType = 'video';

    const fileUrl = URL.createObjectURL(file);

    const newMsg = {
      id: `msg-${Date.now()}`,
      senderId: 'me',
      text: attachType === 'file' ? `Fichier: ${file.name}` : '',
      attachment: { type: attachType, url: fileUrl, name: file.name },
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      ttl: 0,
      locked: true,
    };
    
    // Auto-reply context update
    conv.messages.push(newMsg);
    conv.lastMessage = attachType === 'file' ? `📁 Fichier` : attachType === 'image' ? `📷 Photo` : `🎥 Vidéo`;
    conv.timestamp = newMsg.time;
    
    e.target.value = '';
    
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
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
    if (!msg.decryptedAt) {
      msg.decryptedAt = Date.now();
    }
    msg.ttl = 180;
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
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative flex-shrink-0">
        <MediaTray open={showMedia} onSelect={handleMediaSelect} />
        
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept={fileAccept}
          onChange={handleFileChange}
        />

        {recording ? (
          <VoiceRecorder
            onCancel={() => setRecording(false)}
            onSend={() => setRecording(false)}
          />
        ) : (
          <div
            className="flex items-end gap-3 px-4 py-3 backdrop-blur-xl transition-all"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <button
              onClick={() => setShowMedia(!showMedia)}
              className="flex-shrink-0 p-2.5 text-white/40 hover:text-white/90 transition-all hover:scale-105 active:scale-95 bg-white/5 rounded-full border border-white/5"
            >
              <Plus size={20} />
            </button>

            <div className="flex-1 relative flex items-center bg-white/5 border border-white/10 rounded-2xl shadow-inner transition-colors focus-within:bg-white/10 focus-within:border-white/20">
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value.slice(0, 500))}
                placeholder="Message chiffré..."
                rows={1}
                className="w-full bg-transparent px-4 py-3 text-[14px] text-white/90 placeholder:text-white/30 outline-none resize-none max-h-[100px]"
                style={{ minHeight: 44, scrollbarWidth: 'none' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </div>

            {messageText.trim() ? (
              <button
                onClick={handleSend}
                className="flex-shrink-0 flex items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(255,0,60,0.4)] hover:shadow-[0_0_20px_rgba(255,0,60,0.6)]"
                style={{ width: 44, height: 44, backgroundColor: '#ff003c' }}
              >
                <Send size={18} className="text-white ml-1" />
              </button>
            ) : (
              <button
                onClick={() => setRecording(true)}
                className="flex-shrink-0 flex items-center justify-center rounded-full bg-white/5 border border-white/5 p-2.5 text-white/40 hover:text-[#ff003c] transition-all hover:scale-105 active:scale-95"
                style={{ width: 44, height: 44 }}
              >
                <Mic size={20} />
              </button>
            )}
          </div>
        )}

        {messageText.trim() && (
          <div className="absolute -top-10 left-0 right-0 flex justify-center" style={{ animation: 'fade-in 0.2s ease-out' }}>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
              <Lock size={10} style={{ color: '#ff003c' }} />
              <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-white/40">
                E2E · DOUBLE RATCHET
              </span>
            </div>
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
