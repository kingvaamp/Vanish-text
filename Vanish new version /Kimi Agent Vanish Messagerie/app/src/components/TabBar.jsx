import { MessageSquare, Phone, Users, User } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const TABS = [
  { id: 'chats', label: 'Chats', Icon: MessageSquare },
  { id: 'calls', label: 'Appels', Icon: Phone },
  { id: 'contacts', label: 'Contacts', Icon: Users },
  { id: 'profile', label: 'Profil', Icon: User },
];

export default function TabBar() {
  const { activeTab, setTab, conversations } = useApp();
  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex items-center justify-around px-2 z-50"
      style={{
        height: 56,
        backgroundColor: 'rgba(5, 0, 0, 0.92)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255, 0, 60, 0.08)',
        maxWidth: 430,
        margin: '0 auto',
      }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className="flex flex-col items-center justify-center gap-0.5 relative"
            style={{ width: 64, height: 48 }}
          >
            <tab.Icon
              size={22}
              style={{ color: isActive ? '#ff003c' : 'rgba(255,255,255,0.4)' }}
              strokeWidth={isActive ? 2.5 : 1.5}
            />
            <span
              className="text-[9px] font-medium tracking-wide"
              style={{ color: isActive ? '#ff003c' : 'rgba(255,255,255,0.4)' }}
            >
              {tab.label}
            </span>
            {isActive && (
              <span
                className="absolute -top-0.5 rounded-full"
                style={{
                  width: 4,
                  height: 4,
                  backgroundColor: '#ff003c',
                  boxShadow: '0 0 6px rgba(255, 0, 60, 0.6)',
                }}
              />
            )}
            {tab.id === 'chats' && unreadTotal > 0 && (
              <span
                className="absolute -top-0.5 right-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{
                  width: 16,
                  height: 16,
                  backgroundColor: '#ff003c',
                }}
              >
                {unreadTotal}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
