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

  // Group calls by date while preserving the original order
  const groupedCalls = calls.reduce((acc, call) => {
    if (!acc[call.date]) acc[call.date] = [];
    acc[call.date].push(call);
    return acc;
  }, {});

  const dateKeys = [...new Set(calls.map(c => c.date))];

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
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-2 space-y-6" style={{ scrollbarWidth: 'none' }}>
        {dateKeys.map((date) => (
          <div key={date} className="flex flex-col gap-2.5">
            {/* Date header */}
            <h2 className="text-[13px] font-bold uppercase tracking-[0.2em] pl-4 text-white/30 drop-shadow-md">
              {date}
            </h2>

            {/* Glass Container for Calls */}
            <div className="rounded-3xl overflow-hidden backdrop-blur-xl bg-black/40 border border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              {groupedCalls[date].map((call, i) => {
                const contact = contacts.find((c) => c.id === call.contactId);
                if (!contact) return null;

                const { Icon, color } = CALL_ICONS[call.type];

                return (
                  <div
                    key={call.id}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/5 ${
                      i < groupedCalls[date].length - 1 ? 'border-b border-white/5' : ''
                    }`}
                  >
                    <Av name={contact.name} size={44} online={false} />

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h3 className={`text-[15px] font-medium tracking-wide truncate ${call.type === 'missed' ? 'text-[#ff003c]' : 'text-white/90'}`}>
                        {contact.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Icon size={14} style={{ color }} />
                        <span className="text-[12px] font-mono capitalize" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          {call.type === 'incoming' ? 'Entrant' : call.type === 'outgoing' ? 'Sortant' : 'Manqué'}
                          {call.duration && ` · ${call.duration}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        onClick={() => handleCall(contact)}
                        className="flex items-center justify-center p-2.5 rounded-full transition-all hover:bg-white/10 active:scale-95"
                      >
                        <Phone size={20} style={{ color: '#ff003c' }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
