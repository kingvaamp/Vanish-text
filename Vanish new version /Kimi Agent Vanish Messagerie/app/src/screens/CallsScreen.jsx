import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Plus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import Av from '@/components/Av';

const CALL_ICONS = {
  incoming: { Icon: PhoneIncoming, color: '#22c55e' },
  outgoing: { Icon: PhoneOutgoing, color: '#3b82f6' },
  missed: { Icon: PhoneMissed, color: '#ff003c' },
};

export default function CallsScreen() {
  const { calls, contacts, startCall } = useApp();

  const handleCall = (contact) => {
    startCall({
      name: contact.name,
      contactId: contact.id,
    });
  };

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
        <h1 className="text-[17px] font-medium text-white">Appels</h1>
        <button
          className="flex items-center justify-center rounded-full"
          style={{ width: 32, height: 32, backgroundColor: 'rgba(255, 0, 60, 0.15)' }}
        >
          <Plus size={18} style={{ color: '#ff003c' }} />
        </button>
      </div>

      {/* Call log */}
      <div className="flex-1 overflow-y-auto">
        {calls.map((call) => {
          const contact = contacts.find((c) => c.id === call.contactId);
          if (!contact) return null;

          const { Icon, color } = CALL_ICONS[call.type];

          return (
            <div
              key={call.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255, 0, 60, 0.04)' }}
            >
              <Av name={contact.name} size={40} online={false} />

              <div className="flex-1 min-w-0">
                <h3 className={`text-[15px] truncate ${call.type === 'missed' ? 'text-[#ff003c]' : 'text-white/90'}`}>
                  {contact.name}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Icon size={13} style={{ color }} />
                  <span className="text-[12px] capitalize" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {call.type === 'incoming' ? 'Entrant' : call.type === 'outgoing' ? 'Sortant' : 'Manqué'}
                    {call.duration && ` · ${call.duration}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {call.date}
                </span>
                <button
                  onClick={() => handleCall(contact)}
                  className="flex items-center justify-center rounded-full transition-transform active:scale-90"
                  style={{ width: 36, height: 36, backgroundColor: 'rgba(255, 0, 60, 0.12)' }}
                >
                  <Phone size={16} style={{ color: '#ff003c' }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
