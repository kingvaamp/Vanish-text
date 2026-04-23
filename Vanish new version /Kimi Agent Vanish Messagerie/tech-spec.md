# Vanish — Technical Specification

## Dependencies

### Runtime
- `react` ^18.3.0 + `react-dom` ^18.3.0
- `@supabase/supabase-js` ^2.47.0 — Auth (OTP + Google OAuth), PostgreSQL, Realtime
- `lucide-react` ^0.468.0 — All icons (Lock, Phone, Video, Mic, Send, etc.)
- `gsap` ^3.12.0 — Timeline animations, stagger effects
- `clsx` ^2.1.0 — Conditional class composition
- `tailwind-merge` ^2.6.0 — Tailwind class deduplication

### Dev
- `typescript` ^5.6.0
- `vite` ^6.0.0
- `tailwindcss` ^3.4.0
- `@types/react` ^18.3.0
- `@types/react-dom` ^18.3.0

---

## Component Inventory

### shadcn/ui (installed via init)
| Component | Usage |
|-----------|-------|
| `button` | CTAs, icon buttons, ghost buttons |
| `input` | Phone input, OTP code, search, message textarea |
| `dialog` | New message modal, add contact modal |
| `sheet` | Contact detail bottom sheet |
| `switch` | Security toggles (Profile screen) |
| `separator` | Dividers in lists |
| `scroll-area` | Chat scroll, contact list scroll |

### Custom Components

#### Crypto Layer (`src/crypto/`)
| Module | Key Exports | Description |
|--------|-------------|-------------|
| `primitives.js` | `toB64`, `fromB64`, `generateKeyPair`, `importPublicKey`, `importPrivateKey`, `ecdh`, `hkdf`, `hmac`, `encrypt`, `decrypt` | WebCrypto primitives |
| `doubleRatchet.js` | `DoubleRatchet` class | Full Double Ratchet with sendChain/recvChain, HMAC discriminators |
| `keyStorage.js` | `saveIdentityKey`, `loadIdentityKey`, `saveRatchetSession`, `loadRatchetSession`, `wipeAllKeys` | AES-GCM encrypted localStorage |
| `safetyNumber.js` | `computeSafetyNumber` | 60-digit decimal identity verification |

#### Shared UI Components (`src/components/`)
| Component | Props | Description |
|-----------|-------|-------------|
| `Av` | `name: string`, `size: number`, `online?: boolean` | Initials avatar, color derived from name hash, online dot |
| `Tog` | `checked: boolean`, `onChange: fn` | 46x26 toggle, red active, CSS thumb animation |
| `BadgeE2E` | — | "🔒 E2E" span with red transparent bg |
| `Notifs` | `notifications: array`, `onDismiss: fn` | Toast container, top-right, auto-dismiss 4s |
| `MediaTray` | `onSelect: fn`, `open: boolean` | 4-button slide-up: Photo/Video/File/Camera |
| `VoiceRecorder` | `onCancel: fn`, `onSend: fn` | Red waveform animation, timer, Cancel/Send |
| `CallOverlay` | `contact: object`, `onEnd: fn` | Fullscreen with RadialDataRings, status, controls |
| `SafetyNumberDisplay` | `myKey: string`, `theirKey: string` | 60 digits in 12 groups of 5 |
| `RedProgressBar` | `ttl: number`, `max: number` | 3px progress bar with glow pulse |
| `GlitchText` | `text: string`, `trigger: boolean` | 150ms CSS glitch effect on decrypt |
| `PlasmaBackground` | `opacity: number` | WebGL plasma shader canvas |
| `RadialDataRings` | — | 3 concentric pulsing CSS rings |
| `TabBar` | `activeTab: string`, `onChange: fn` | Fixed bottom nav, 4 tabs |
| `ConversationRow` | `conversation: object` | Chat list row with unread/read states |
| `MessageBubble` | `message: object`, `isSent: boolean` | Bubble with lock/reveal/TTL states |
| `ContactRow` | `contact: object` | Contact list item with actions |

#### Screen Components (`src/screens/`)
| Screen | Description |
|--------|-------------|
| `LoginScreen` | Phone OTP + Google OAuth, 2-step flow |
| `ChatsScreen` | Conversation list + Chat detail (slide-in) + New message modal |
| `CallsScreen` | Call history list + Active call overlay |
| `ContactsScreen` | Alphabetical directory + Search + Detail sheet + Add modal |
| `ProfileScreen` | Avatar, stats, security toggles, danger zone |

---

## Animation Implementation Plan

| Animation | Library / Approach | Implementation |
|-----------|--------------------|----------------|
| Plasma Tendrils background | **Raw WebGL** | Custom vertex/fragment shaders, fullscreen triangle, rAF loop |
| List entrance stagger | **GSAP** | `gsap.from(items, { y: 10, opacity: 0, stagger: 0.05, duration: 0.3 })` |
| Message send burst | **CSS** | `transform: scale(0.8→1)` + `box-shadow` burst, 0.2s ease-out |
| Message decrypt glitch | **CSS** | `filter: invert(1) skewX(10deg)` for 150ms, then revert |
| Message destruction | **GSAP** | `gsap.to(bubble, { height: 0, opacity: 0, duration: 0.4 })` + "OBLITERATED" fade-in |
| TTL progress bar pulse | **CSS @keyframes** | `ttl-pulse` animation on bar glow, toggle below 30s |
| Radial data rings | **CSS @keyframes** | `ring-pulse` with staggered delays (0s, 0.6s, 1.2s) |
| Active call pulse rings | **CSS @keyframes** | 2 neon rings around avatar, infinite ease-out |
| Recording blink | **CSS @keyframes** | `rec-blink` opacity toggle |
| Slide-in page transitions | **CSS** | `translateX(100%→0)` for chat detail, 0.3s ease |
| Media tray slide-up | **CSS** | `translateY(100%→0)` with backdrop opacity |
| Bottom sheet | **GSAP/CSS** | Sheet slides up, backdrop fades in |
| Toast slide-down | **GSAP/CSS** | `translateY(-100%→0)`, auto-dismiss with fade-out |
| Toggle switch | **CSS** | Thumb `translateX` transition, track color transition |
| Voice waveform | **CSS @keyframes** | 5 bars with random `scaleY` animation heights |
| Chat bubble glow | **CSS** | Subtle `box-shadow` on hover/active states |

---

## State & Logic Plan

### Architecture Pattern
- **Global state**: React Context + `useReducer` (no external state library — app scope is manageable)
- **Local state**: `useState` / `useReducer` per screen/component
- **Crypto state**: `useCrypto` hook wraps all E2E operations

### State Slices

#### `AuthContext`
```
state: { user: User | null, session: Session | null, loading: boolean }
actions: signInWithOtp(phone), verifyOtp(phone, code), signInWithGoogle(), signOut()
```
- Supabase `onAuthStateChange` listener updates context
- Guard: throw if env vars missing at startup

#### `AppContext` (global app state)
```
state: {
  activeTab: 'chats' | 'calls' | 'contacts' | 'profile',
  activeChatId: string | null,
  activeCall: CallState | null,
  notifications: Notification[],
  contacts: Contact[],
  conversations: Conversation[],
  currentUser: { id, name, phone, publicKey, avatarColor }
}
```

#### `CryptoContext`
```
state: {
  identityKeyPair: { publicKey, privateKey } | null,
  ratchetSessions: Map<conversationId, DoubleRatchet>
}
actions: generateKeys(), encryptMessage(cid, plaintext, directory), 
         decryptMessage(cid, payload), getSafetyNumber(theirKey)
```

### Data Flow

```
User sends message:
  Input text → CryptoContext.encryptMessage()
    → Generate message keys via Double Ratchet
    → Encrypt for each recipient (ECDH + AES-GCM)
    → Return ciphertexts JSON
  → Supabase insert into messages table
  → Realtime broadcasts to recipients
  → Recipients decrypt via CryptoContext
  → Message appears in UI

Message read + TTL:
  Tap to decrypt → Supabase update read_at + expires_at (+3min)
  → Start local TTL countdown (setInterval 1s)
  → Progress bar updates
  → At 0: GSAP destroy animation → Supabase delete
  → UI removes message

Auth flow:
  LoginScreen → AuthContext.signInWithOtp()
  → Supabase sends OTP
  → Enter code → verifyOtp()
  → On success: generate crypto keys → upload public key to profiles
  → Navigate to ChatsScreen
```

### Demo Data System
- **Alice/Bob toggle**: Simulates switching between two user contexts for demo purposes ( swaps `currentUser` state )
- **Demo contacts**: Hardcoded Senegalese contacts with generated key pairs
- **Demo conversations**: Pre-seeded with encrypted placeholder messages
- **Demo call logs**: Static data displayed in CallsScreen

### TTL Engine
- `useTtlEngine` hook: `setInterval` every 1s
- Iterates all messages with `isRead && hasTtl`
- Decrements TTL, updates progress bar
- At 0: calls `deleteMessage(messageId)` → removes from state + Supabase
- Visual: progress bar width = `ttl / 180 * 100%`
- Critical mode (< 30s): color changes to `#ff3333`, pulse animation ON

### Supabase Realtime
- Subscribe to `postgres_changes` on `public.messages`
- Filter: `eventType = 'INSERT'` where `cid` contains current user ID
- On new message: decrypt and add to conversation state
- Prevent duplicates: check `message.id` against existing messages

---

## File Structure

```
src/
├── crypto/
│   ├── primitives.js       # WebCrypto: ECDH, AES-GCM, HKDF, HMAC, base64
│   ├── doubleRatchet.js    # DoubleRatchet class (sendChain, recvChain, serialize)
│   ├── keyStorage.js       # Encrypted localStorage wrapper
│   └── safetyNumber.js     # 60-digit safety number computation
├── hooks/
│   ├── useCrypto.js        # Main crypto hook (encrypt/decrypt/key management)
│   ├── useTtlEngine.js     # TTL countdown engine
│   ├── useSupabase.js      # Supabase client + realtime subscriptions
│   └── useVoiceRecorder.js # MediaRecorder API wrapper
├── lib/
│   └── supabase.js         # Supabase client singleton with env guard
├── components/
│   ├── PlasmaBackground.jsx    # WebGL plasma shader
│   ├── RadialDataRings.jsx     # CSS pulsing rings
│   ├── GlitchText.jsx          # CSS glitch effect
│   ├── RedProgressBar.jsx      # TTL progress bar
│   ├── Av.jsx                  # Avatar component
│   ├── Tog.jsx                 # Toggle switch
│   ├── BadgeE2E.jsx            # E2E badge
│   ├── Notifs.jsx              # Toast notifications
│   ├── TabBar.jsx              # Bottom navigation
│   ├── MediaTray.jsx           # Media selector panel
│   ├── VoiceRecorder.jsx       # Voice recording UI
│   ├── CallOverlay.jsx         # Active call screen
│   ├── SafetyNumberDisplay.jsx # Safety number UI
│   ├── ConversationRow.jsx     # Chat list item
│   ├── MessageBubble.jsx       # Chat message bubble
│   ├── ContactRow.jsx          # Contact list item
│   └── ui/                     # shadcn components (auto-installed)
├── screens/
│   ├── LoginScreen.jsx     # Auth: OTP + Google
│   ├── ChatsScreen.jsx     # Conversations + Chat detail + New message
│   ├── CallsScreen.jsx     # Call history + Call overlay trigger
│   ├── ContactsScreen.jsx  # Directory + Detail + Add contact
│   └── ProfileScreen.jsx   # Settings + Security + Account
├── context/
│   ├── AuthContext.jsx     # Auth state + actions
│   └── AppContext.jsx      # Global app state
├── data/
│   └── demoData.js         # Demo contacts, conversations, call logs
├── App.jsx                 # Root: Router + TabBar + Context providers
├── main.jsx                # Entry point
└── index.css               # Global styles + CSS keyframes + Tailwind
```

---

## Key Implementation Notes

### WebGL Plasma Shader
- Fullscreen triangle geometry (not quad — more efficient)
- Single canvas element, z-index: -1, position: fixed
- Pause rAF when `document.hidden === true`
- Opacity controlled via parent container for chat pages (0.3)

### Double Ratchet Protocol
- HMAC discriminators: `0x01` for next chain key, `0x02` for message key
- Each message key used exactly once then discarded
- State serialized/deserialized via `keyStorage` after every message
- Forward secrecy: previous keys cannot derive future keys

### Message Payload Structure (stored in Supabase)
```json
{
  "user-uuid-bob": {
    "algo": "double-ratchet-v1",
    "iv": "base64...",
    "ciphertext": "base64...",
    "senderPublicKey": "base64...",
    "msgIndex": 42
  }
}
```

### Security Rules (enforced)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env` only
- Guard at startup: `if (!url || !key) throw new Error(...)`
- Private keys NEVER in plain text in localStorage — always AES-GCM wrapped
- No API keys in source code

### Mobile-First Layout
- Root container: `max-width: 430px`, centered, `height: 100dvh`
- Tab bar: fixed bottom, 56px height
- Header: fixed top, 52px height
- Safe area insets handled via `env(safe-area-inset-*)`
- No horizontal scroll, vertical scroll with `-webkit-scrollbar: none`
