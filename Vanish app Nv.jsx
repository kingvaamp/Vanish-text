import { useState, useEffect, useRef, useCallback } from "react";
import useCrypto from './useCrypto';
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

const C = {
  bg:'#080808',s1:'#111',s2:'#181818',s3:'#222',s4:'#2a2a2a',s5:'#333',
  red:'#cc0000',rd:'#8b0000',rb:'#e63333',rdim:'rgba(204,0,0,.1)',rsoft:'rgba(204,0,0,.22)',rglow:'rgba(204,0,0,.05)',
  white:'#fff',text:'#f0f0f0',text2:'#c0c0c0',muted:'#666',muted2:'#444',
  border:'rgba(255,255,255,.06)',b2:'rgba(255,255,255,.1)',b3:'rgba(255,255,255,.16)',
  green:'#22c55e',gdim:'rgba(34,197,94,.1)',
  amber:'#f59e0b',adim:'rgba(245,158,11,.1)',
  blue:'#3b82f6',bdim:'rgba(59,130,246,.1)',
};
const F = "Helvetica,'Helvetica Neue',Arial,sans-serif";
const AV_COLORS = [
  {bg:'rgba(204,0,0,.15)',fg:'#e63333',br:'rgba(204,0,0,.3)'},
  {bg:'rgba(59,130,246,.12)',fg:'#60a5fa',br:'rgba(59,130,246,.25)'},
  {bg:'rgba(16,185,129,.1)',fg:'#34d399',br:'rgba(16,185,129,.22)'},
  {bg:'rgba(245,158,11,.1)',fg:'#fbbf24',br:'rgba(245,158,11,.22)'},
  {bg:'rgba(139,92,246,.12)',fg:'#a78bfa',br:'rgba(139,92,246,.25)'},
  {bg:'rgba(236,72,153,.1)',fg:'#f472b6',br:'rgba(236,72,153,.22)'},
  {bg:'rgba(20,184,166,.1)',fg:'#2dd4bf',br:'rgba(20,184,166,.22)'},
  {bg:'rgba(249,115,22,.1)',fg:'#fb923c',br:'rgba(249,115,22,.22)'},
];
const avC = n => AV_COLORS[(n.charCodeAt(0)+(n.charCodeAt(n.length-1)||0))%AV_COLORS.length];
const ini = n => n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const now = () => {const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const fmt = s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
const rnd = n=>Array.from({length:n},()=>'abcdef0123456789'[Math.floor(Math.random()*16)]).join('');
let uid=1; const nid=()=>String(uid++);

const INITIAL_CONTACTS = [
  {id:'c1',name:'Binta Diallo',phone:'+221 77 123 4567',online:true},
  {id:'c2',name:'Cheikh Ndiaye',phone:'+221 78 234 5678',online:true},
  {id:'c3',name:'Fatou Sow',phone:'+221 76 345 6789',online:false},
  {id:'c4',name:'Moussa Ba',phone:'+221 70 456 7890',online:false},
  {id:'c5',name:'Aïssatou Fall',phone:'+221 77 567 8901',online:true},
  {id:'c6',name:'Ibrahima Cissé',phone:'+221 78 678 9012',online:false},
  {id:'c7',name:'Mariama Diop',phone:'+221 76 789 0123',online:true},
  {id:'c8',name:'Ousmane Sarr',phone:'+221 70 890 1234',online:false},
];
const CALLS_HIST = [
  {id:'h1',name:'Binta Diallo',type:'incoming',missed:false,dur:'2:34',time:'12:04'},
  {id:'h2',name:'Cheikh Ndiaye',type:'outgoing',missed:false,dur:'8:11',time:'Hier'},
  {id:'h3',name:'Fatou Sow',type:'incoming',missed:true,dur:'',time:'Hier'},
  {id:'h4',name:'Moussa Ba',type:'outgoing',missed:false,dur:'1:22',time:'Lun'},
  {id:'h5',name:'Aïssatou Fall',type:'incoming',missed:false,dur:'5:48',time:'Lun'},
];

function Av({name,size=42,online=false}) {
  const c=avC(name);
  return (
    <div style={{position:'relative',flexShrink:0}}>
      <div style={{width:size,height:size,borderRadius:'50%',background:c.bg,color:c.fg,border:`1.5px solid ${c.br}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:F,fontWeight:700,fontSize:Math.round(size*.38),flexShrink:0}}>{ini(name)}</div>
      {online&&<div style={{width:11,height:11,borderRadius:'50%',background:C.green,border:`2.5px solid ${C.bg}`,position:'absolute',bottom:0,right:0}}/>}
    </div>
  );
}
function Tog({on,onToggle}) {
  return <div onClick={onToggle} style={{width:46,height:26,borderRadius:13,background:on?C.red:C.s4,position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}><div style={{width:20,height:20,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:on?23:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.3)'}}/></div>;
}
function Badge() {
  return <span style={{fontSize:9,fontWeight:700,fontFamily:F,background:C.rdim,color:C.rb,padding:'1px 6px',borderRadius:4,border:`1px solid ${C.rsoft}`,letterSpacing:'.04em'}}>🔒 E2E</span>;
}
function Notifs({items}) {
  if(!items.length) return null;
  return <div style={{position:'absolute',top:8,right:8,zIndex:99,display:'flex',flexDirection:'column',gap:5,maxWidth:260,pointerEvents:'none'}}>
    {items.map(n=><div key={n.id} style={{background:C.s2,border:`1px solid ${n.t==='s'?'rgba(255,68,68,.3)':n.t==='v'?'rgba(245,158,11,.25)':C.b2}`,borderRadius:12,padding:'9px 12px',display:'flex',gap:8}}>
      <span style={{fontSize:16,flexShrink:0}}>{n.icon}</span>
      <div><div style={{fontFamily:F,fontWeight:700,fontSize:12,color:n.t==='s'?'#ff4444':n.t==='v'?C.amber:C.rb,marginBottom:2}}>{n.title}</div><div style={{fontFamily:F,fontSize:11,color:C.muted,lineHeight:1.4}}>{n.body}</div></div>
    </div>)}
  </div>;
}

// ── PhoneIcon SVG helper ──
const PhoneIcon = ({stroke,w=20}) => <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.47 2 2 0 0 1 3.62 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 8 8l.9-.89a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const MsgIcon = ({stroke,w=20}) => <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const SearchIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
const SendIcon = ({c}) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;

export default function VanishText() {
  const [tab,setTab]=useState('chats');
  const [view,setView]=useState('alice');
  const [activeConv,setActiveConv]=useState(null);
  const [convs,setConvs]=useState({});
  const [input,setInput]=useState('');
  const [mediaTray,setMediaTray]=useState(false);
  const [recording,setRecording]=useState(false);
  const [recSec,setRecSec]=useState(0);
  const [mediaPreview,setMediaPreview]=useState(null);
  const recTimerRef=useRef(null);
  const fileInputRef=useRef(null);
  const [callOverlay,setCallOverlay]=useState(null);
  const [callSec,setCallSec]=useState(0);
  const [callConn,setCallConn]=useState(false);
  const [ctrls,setCtrls]=useState({mute:false,spk:false,vid:false});
  const [detailContact,setDetailContact]=useState(null);
  const [newMsgOpen,setNewMsgOpen]=useState(false);
  const [selected,setSelected]=useState(new Set());
  const [bcMode,setBcMode]=useState(false);
  const [bcText,setBcText]=useState('');
  const [settings,setSettings]=useState({ss:true,ra:true,bio:false,sca:true,snd:true});
  const [cSearch,setCSearch]=useState('');
  const [notifs,setNotifs]=useState([]);
  const [contactsState,setContactsState]=useState(INITIAL_CONTACTS);
  const CONTACTS = contactsState;
  const [addContactOpen,setAddContactOpen]=useState(false);
  const [newContactName,setNewContactName]=useState('');
  const [newContactPhone,setNewContactPhone]=useState('');
  const { keys, encryptMessage, decryptMessage, generateKeys } = useCrypto();
  useEffect(()=>{ generateKeys(); },[generateKeys]);
  const callRef=useRef(null);
  const connRef=useRef(null);
  const nref=useRef(200);
  const listRef=useRef(null);

  // Socket.IO Integration
  useEffect(() => {
    const handleMessage = (m) => {
      setConvs(p => {
        const convId = m.cid || 'c1';
        if (!p[convId]) return p;
        const c = { ...p[convId] };
        if (c.messages.some(msg => msg.id === m.id)) return p;
        c.messages = [...c.messages, m];
        const unreadKey = m.sender === 'alice' ? 'uB' : 'uA';
        c[unreadKey] = (c[unreadKey] || 0) + 1;
        return { ...p, [convId]: c };
      });
    };
    socket.on('receive_message', handleMessage);
    return () => socket.off('receive_message', handleMessage);
  }, []);

  // TTL engine
  useEffect(()=>{
    const iv=setInterval(()=>{
      setConvs(prev=>{
        let changed=false;
        const next={};
        for(const [k,c] of Object.entries(prev)){
          const msgs=c.messages.map(m=>{
            if(m.isRead&&m.ttl>0){changed=true;return{...m,ttl:m.ttl-1};}
            return m;
          }).filter(m=>!(m.isRead&&m.ttl===0&&m.hasTtl));
          if(msgs.length!==c.messages.length) changed=true;
          next[k]={...c,messages:msgs};
        }
        return changed?next:prev;
      });
    },1000);
    return ()=>clearInterval(iv);
  },[]);

  // Call timer
  useEffect(()=>{
    if(callOverlay&&callConn){callRef.current=setInterval(()=>setCallSec(s=>s+1),1000);}
    return ()=>clearInterval(callRef.current);
  },[callOverlay,callConn]);

  const pushN=useCallback((t,icon,title,body)=>{
    const id=String(nref.current++);
    setNotifs(p=>[...p,{id,t,icon,title,body}]);
    setTimeout(()=>setNotifs(p=>p.filter(n=>n.id!==id)),4000);
  },[]);

  const openConv=useCallback((cid)=>{
    setActiveConv(cid);
    setConvs(p=>({...p,[cid]:{...p[cid],[view==='alice'?'uA':'uB']:0}}));
    setTab('chats');
  },[view]);

  const startConv=useCallback((contact)=>{
    if(!convs[contact.id]){
      setConvs(p=>({...p,[contact.id]:{id:contact.id,name:contact.name,phone:contact.phone,online:contact.online,messages:[],uA:0,uB:0}}));
    }
    openConv(contact.id);
    setNewMsgOpen(false);setSelected(new Set());setBcMode(false);
  },[convs,openConv]);

  const sendMsg=useCallback(async (text,cid=activeConv)=>{
    if(!text.trim()||!cid) return;
    const cipherText = await encryptMessage(text.trim(), 'pub_key');
    const m={id:nid(),type:'text',text:cipherText,sender:view,time:now(),status:'sent',isRead:false,ttl:0,hasTtl:false,enc:rnd(6)+'…'+rnd(8), cid};
    
    // Serveur
    socket.emit('send_message', m);

    // Local
    setConvs(p=>{const c={...p[cid]};c.messages=[...c.messages,m];c[view==='alice'?'uB':'uA']=(c[view==='alice'?'uB':'uA']||0)+1;return{...p,[cid]:c};});
    setInput('');
    setTimeout(()=>setConvs(p=>{const c={...p[cid]};c.messages=c.messages.map(x=>x.id===m.id?{...x,status:'delivered'}:x);return{...p,[cid]:c};}),700);
  },[activeConv,view,encryptMessage]);

  const readMsg=useCallback(async (cid,mid)=>{
    let targetMsg = null;
    setConvs(p=>{ targetMsg = p[cid]?.messages.find(m=>m.id===mid); return p; });
    if (!targetMsg || targetMsg.isRead) return;
    
    let decryptedText = targetMsg.text;
    if (targetMsg.text && targetMsg.text.startsWith('enc:')) {
      decryptedText = await decryptMessage(targetMsg.text);
    }
    
    setConvs(p=>{const c={...p[cid]};c.messages=c.messages.map(m=>m.id===mid&&!m.isRead?{...m,text:decryptedText,isRead:true,status:m.sender!==view?'read':m.status,ttl:180,hasTtl:true}:m);return{...p,[cid]:c};});
    pushN('m','👁','Decrypted','Disappears in 3 minutes');
  },[view,pushN,decryptMessage]);

  const startCall=useCallback((name)=>{
    setCallOverlay({name});setCallSec(0);setCallConn(false);setCtrls({mute:false,spk:false,vid:false});
    connRef.current=setTimeout(()=>setCallConn(true),2000);
  },[]);
  const endCall=useCallback(()=>{
    clearTimeout(connRef.current);clearInterval(callRef.current);
    pushN('m','📞','Call ended',`Duration: ${fmt(callSec)}`);
    setCallOverlay(null);setCallSec(0);setCallConn(false);
  },[callSec,pushN]);

  const sendBc=useCallback(async ()=>{
    if(!bcText.trim() && !mediaPreview) return;
    const baseText = bcText.trim() || `${mediaPreview?.icon} ${mediaPreview?.name}`;
    const cipherText = await encryptMessage(baseText, 'pub_key');
    const mediaProps = mediaPreview ? { mediaName: mediaPreview.name, mediaUrl: mediaPreview.url, mediaIcon: mediaPreview.icon, type: mediaPreview.type, dur: mediaPreview.dur } : { type: 'text' };
    
    [...selected].forEach((cid,i)=>{
      const ct=CONTACTS.find(c=>c.id===cid);if(!ct) return;
      if(!convs[cid]) setConvs(p=>({...p,[cid]:{id:cid,name:ct.name,phone:ct.phone,online:ct.online,messages:[],uA:0,uB:0}}));
      setTimeout(()=>{
        const m={id:nid(), text:cipherText, sender:view, time:now(), status:'sent', isRead:false, ttl:0, hasTtl:false, enc:rnd(6)+'…'+rnd(8), bc:true, cid, ...mediaProps};
        socket.emit('send_message', m);
        setConvs(p=>{const c={...p[cid]||{id:cid,name:ct.name,phone:ct.phone,online:ct.online,messages:[],uA:0,uB:0}};c.messages=[...c.messages,m];c[view==='alice'?'uB':'uA']=(c[view==='alice'?'uB':'uA']||0)+1;return{...p,[cid]:c};});
        setTimeout(()=>setConvs(p=>({...p,[cid]:{...p[cid],messages:p[cid].messages.map(x=>x.id===m.id?{...x,status:'delivered'}:x)}})),700);
      },i*220);
    });
    pushN('m','📣',`Broadcast sent`,`To ${selected.size} contacts`);
    setNewMsgOpen(false);setBcMode(false);setBcText('');setSelected(new Set());setMediaPreview(null);
  },[bcText,selected,view,encryptMessage,mediaPreview,pushN]);

  const conv=activeConv?convs[activeConv]:null;
  const convList=Object.values(convs);
  const allMsgs=convList.reduce((s,c)=>s+c.messages.length,0);
  const filtCt=CONTACTS.filter(c=>c.name.toLowerCase().includes(cSearch.toLowerCase())||c.phone.includes(cSearch));
  const ctGroups={};filtCt.forEach(c=>{const k=c.name[0].toUpperCase();if(!ctGroups[k])ctGroups[k]=[];ctGroups[k].push(c);});
  const hasUnread=convList.some(c=>view==='alice'?c.uA>0:c.uB>0);

  const getTabStyle = (id) => {
    const arr = ['chats', 'calls', 'contacts', 'profile'];
    const act = tab === id;
    const diff = arr.indexOf(id) - arr.indexOf(tab);
    return {
      position: 'absolute', inset: 0,
      opacity: act ? 1 : 0,
      pointerEvents: act ? 'all' : 'none',
      transform: `translateX(${act ? 0 : diff > 0 ? 30 : -30}px) scale(${act ? 1 : 0.96})`,
      transition: 'opacity 0.4s cubic-bezier(0.3, 0.9, 0.3, 1), transform 0.4s cubic-bezier(0.3, 0.9, 0.3, 1)',
      zIndex: act ? 10 : 0
    };
  };

  return (
    <div style={{position:'relative',width:'100%',maxWidth:430,height:760,margin:'0 auto',background:C.bg,borderRadius:16,overflow:'hidden',fontFamily:F,color:C.text,display:'flex',flexDirection:'column',border:`1px solid ${C.border}`,boxShadow:'0 8px 40px rgba(0,0,0,.8)'}}>
      <style>{`@keyframes rp{0%{transform:scale(.9);opacity:1}100%{transform:scale(1.1);opacity:0}}@keyframes gp{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.4)}50%{box-shadow:0 0 0 3px transparent}}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{display:none}textarea,input{outline:none;-webkit-appearance:none}`}</style>
      <Notifs items={notifs}/>
      <input ref={fileInputRef} type="file" style={{display:'none'}} onChange={e=>{
        const f=e.target.files[0];if(!f)return;
        const isImg=f.type.startsWith('image/');
        const isVid=f.type.startsWith('video/');
        const url=URL.createObjectURL(f);
        setMediaPreview({type:isImg?'image':isVid?'video':'file',name:f.name,size:(f.size/1024).toFixed(0)+'KB',url,icon:isImg?'🖼️':isVid?'🎬':'📄'});
        setMediaTray(false);e.target.value='';
      }}/>

      {/* TOP BAR */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 14px',height:52,background:C.s1,borderBottom:`1px solid ${C.border}`,flexShrink:0,zIndex:30}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:30,height:30,borderRadius:9,background:C.rd,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,.18),transparent 60%)'}}/>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style={{position:'relative',zIndex:1}}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </div>
          <span style={{fontSize:17,fontWeight:700,letterSpacing:'-.02em'}}><span style={{color:C.rb}}>Vanish</span>Text</span>
        </div>
        <div style={{display:'flex',gap:2,background:C.s3,border:`1px solid ${C.border}`,borderRadius:9,padding:3}}>
          {['alice','bob'].map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:'4px 12px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',border:view===v?`1px solid ${v==='alice'?C.rsoft:C.b2}`:'1px solid transparent',background:view===v?(v==='alice'?C.rdim:'rgba(255,255,255,.06)'):'transparent',color:view===v?(v==='alice'?C.rb:C.text2):C.muted,fontFamily:F}}>{v.charAt(0).toUpperCase()+v.slice(1)}</button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:C.muted,fontWeight:600}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:C.red}}/>E2E
        </div>
      </div>

      {/* PAGES */}
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>

        {/* ══ CHATS ══ */}
        <div style={{...getTabStyle('chats'), display:'flex', flexDirection:'column'}}>
          <div style={{flex:1,position:'relative',overflow:'hidden'}}>
            {/* Conv List */}
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',transform:activeConv?'translateX(-28%)':'translateX(0)',opacity:activeConv?.5:1,transition:'transform .28s cubic-bezier(.4,0,.2,1),opacity .28s',pointerEvents:activeConv?'none':'all'}}>
              <div style={{padding:'10px 14px',background:C.s1,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <span style={{fontSize:22,fontWeight:800,letterSpacing:'-.03em'}}>Chats</span>
                  <button onClick={()=>{setNewMsgOpen(true);setBcMode(false);setSelected(new Set());}} style={{width:36,height:36,borderRadius:'50%',background:C.red,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 2px 8px rgba(204,0,0,.35)`}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20 11H13V4a1 1 0 0 0-2 0v7H4a1 1 0 0 0 0 2h7v7a1 1 0 0 0 2 0v-7h7a1 1 0 0 0 0-2z"/></svg>
                  </button>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,background:C.s3,borderRadius:10,padding:'7px 11px',border:`1px solid ${C.border}`}}>
                  <SearchIcon/><input placeholder="Search…" style={{flex:1,background:'transparent',border:'none',color:C.text,fontFamily:F,fontSize:14}} onChange={()=>{}}/>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',background:C.s1,borderBottom:`1px solid ${C.border}`}}>
                <Av name={view==='alice'?'Alice':'Bob'} size={38} online={true}/>
                <div><div style={{fontSize:13,fontWeight:700,color:C.white}}>{view==='alice'?'Alice':'Bob'}</div><div style={{fontSize:11,color:C.muted,marginTop:1}}>My account</div></div>
              </div>
              <div style={{flex:1,overflowY:'auto'}}>
                {convList.length===0?(
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,padding:32}}>
                    <div style={{width:64,height:64,borderRadius:'50%',background:C.rdim,border:`1px solid ${C.rsoft}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <MsgIcon stroke={C.red} w={28}/>
                    </div>
                    <div style={{fontSize:17,fontWeight:700,color:C.white}}>No messages yet</div>
                    <div style={{fontSize:12,color:C.muted,textAlign:'center',maxWidth:200,lineHeight:1.6}}>Tap + to start a Signal-encrypted conversation</div>
                    <button onClick={()=>setNewMsgOpen(true)} style={{background:C.red,color:'#fff',border:'none',borderRadius:24,padding:'11px 24px',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:F}}>New Message</button>
                  </div>
                ):convList.map(c=>{
                  const last=c.messages[c.messages.length-1];
                  const unread=view==='alice'?c.uA:c.uB;
                  const prev=last?(last.isRead?(last.type==='image'?'📷 Photo':last.type==='audio'?'🎙 Voice note':last.type==='video'?'🎬 Video':last.type==='file'?`📄 ${last.mediaName||'File'}`:last.text.slice(0,34)+(last.text.length>34?'…':'')):'🔒 Encrypted message'):'No messages';
                  return (
                    <div key={c.id} onClick={()=>openConv(c.id)} style={{display:'flex',alignItems:'center',gap:11,padding:'10px 14px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',minHeight:66,background:activeConv===c.id?C.rglow:'transparent',position:'relative'}}>
                      {activeConv===c.id&&<div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:C.red,borderRadius:'0 2px 2px 0'}}/>}
                      <Av name={c.name} size={46} online={c.online}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:15,fontWeight:700,color:C.white}}>{c.name}</div>
                        <div style={{fontSize:12,color:last&&!last.isRead?C.rb:C.muted,marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontStyle:last&&!last.isRead?'italic':'normal'}}>{prev}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5,flexShrink:0}}>
                        {last&&<span style={{fontSize:11,color:C.muted}}>{last.time}</span>}
                        {unread>0&&<span style={{background:C.red,color:'#fff',fontSize:11,fontWeight:800,padding:'2px 7px',borderRadius:12,minWidth:20,textAlign:'center'}}>{unread}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{padding:'9px 14px',background:C.s1,borderTop:`1px solid ${C.border}`}}>
                <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:9,padding:'8px 11px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.red,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:5}}>Security</div>
                  {['Signal Protocol X3DH + Double Ratchet','Auto-delete 3 min after reading','Real-time screenshot alerts'].map(t=>(
                    <div key={t} style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <div style={{width:4,height:4,borderRadius:'50%',background:C.red,flexShrink:0}}/><span style={{fontSize:10,color:C.muted}}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat View */}
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',transform:activeConv?'translateX(0)':'translateX(100%)',transition:'transform .28s cubic-bezier(.4,0,.2,1)',background:C.bg}}>
              {conv&&<>
                <div style={{display:'flex',alignItems:'center',gap:9,padding:'0 12px',height:56,background:C.s1,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <button onClick={()=>setActiveConv(null)} style={{width:34,height:34,borderRadius:17,border:'none',background:'transparent',color:C.rb,fontSize:24,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
                  <Av name={conv.name} size={36} online={conv.online}/>
                  <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={()=>setDetailContact(CONTACTS.find(c=>c.id===activeConv)||{id:activeConv,name:conv.name,phone:conv.phone,online:conv.online})}>
                    <div style={{fontSize:15,fontWeight:700,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{conv.name}</div>
                    <div style={{fontSize:11,color:C.muted,display:'flex',alignItems:'center',gap:5,marginTop:1}}><span>{conv.online?'online':'offline'}</span><Badge/></div>
                  </div>
                  <button onClick={()=>startCall(conv.name)} style={{width:34,height:34,borderRadius:17,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <PhoneIcon stroke={C.text2} w={17}/>
                  </button>
                  <button onClick={()=>{if(window.confirm('Clear chat & wipe encryption session?')){setConvs(p=>({...p,[activeConv]:{...p[activeConv],messages:[],uA:0,uB:0}}));}}} style={{width:34,height:34,borderRadius:17,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><circle cx="12" cy="5" r="1.5" fill={C.muted}/><circle cx="12" cy="12" r="1.5" fill={C.muted}/><circle cx="12" cy="19" r="1.5" fill={C.muted}/></svg>
                  </button>
                </div>

                {/* Messages */}
                <div ref={listRef} style={{flex:1,overflowY:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:8}}>
                  {conv.messages.length===0
                    ?<div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,padding:24}}>
                        <div style={{width:50,height:50,borderRadius:'50%',background:C.rdim,border:`1px solid ${C.rsoft}`,display:'flex',alignItems:'center',justifyContent:'center'}}><MsgIcon stroke={C.red} w={22}/></div>
                        <div style={{fontSize:14,fontWeight:700,color:C.text2}}>No messages</div>
                        <div style={{fontSize:11,color:C.muted,textAlign:'center',lineHeight:1.6}}>Signal-encrypted · vanishes 3 min after reading</div>
                      </div>
                    :conv.messages.map(msg=>{
                      const mine=msg.sender===view;
                      const locked=!msg.isRead;
                      const pct=msg.hasTtl?msg.ttl/180*100:100;
                      const crit=msg.hasTtl&&msg.ttl<=30;
                      return (
                        <div key={msg.id} style={{display:'flex',flexDirection:'column',alignSelf:mine?'flex-end':'flex-start',maxWidth:'75%',alignItems:mine?'flex-end':'flex-start'}}>
                          <div onClick={locked?()=>readMsg(activeConv,msg.id):undefined} style={{padding:locked?'10px 13px':'8px 12px',borderRadius:18,borderBottomRightRadius:mine?4:18,borderBottomLeftRadius:mine?18:4,background:locked?(mine?'rgba(245,158,11,.06)':C.s2):(mine?C.rd:C.s3),border:locked?`1px dashed ${mine?'rgba(245,158,11,.25)':C.b2}`:(mine?'none':`1px solid ${C.border}`),cursor:locked?'pointer':'default',fontSize:14,lineHeight:1.5,color:C.text,wordBreak:'break-word'}}>
                            {locked
                              ?<div><div style={{fontSize:11,fontWeight:700,color:mine?C.amber:C.rb,marginBottom:4}}>{mine?'🔒 Tap to reveal':'🔒 Tap to decrypt'}</div><div style={{fontSize:9,fontFamily:'monospace',color:C.muted2,letterSpacing:1}}>{msg.enc}{rnd(8)}</div></div>
                              :msg.type==='audio'
                                ?<div style={{display:'flex',alignItems:'center',gap:8,minWidth:160}}>
                                    <div style={{width:34,height:34,borderRadius:17,background:'rgba(255,255,255,.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>▶</div>
                                    <div style={{flex:1}}>
                                      <div style={{display:'flex',alignItems:'center',gap:2,height:18,marginBottom:3}}>
                                        {Array.from({length:18},(_,i)=><div key={i} style={{width:2.5,borderRadius:2,background:'rgba(255,255,255,.45)',height:Math.floor(Math.random()*12)+4}}/>)}
                                      </div>
                                      <div style={{fontSize:10,color:'rgba(255,255,255,.55)',fontWeight:600}}>{msg.dur?fmt(msg.dur):'0:00'} · Voice note</div>
                                    </div>
                                  </div>
                                :msg.type==='image'&&msg.mediaUrl
                                ?<div>
                                    <img src={msg.mediaUrl} style={{width:'100%',maxWidth:200,borderRadius:10,display:'block',marginBottom:4}}/>
                                    {msg.text&&msg.text!==`🖼️ ${msg.mediaName}`&&<span style={{fontSize:14}}>{msg.text}</span>}
                                    <span style={{fontSize:9,opacity:.35,marginLeft:2}}>🔒</span>
                                  </div>
                                :msg.type==='video'&&msg.mediaUrl
                                ?<div>
                                    <video src={msg.mediaUrl} style={{width:'100%',maxWidth:200,borderRadius:10,display:'block',marginBottom:4}} controls/>
                                    <span style={{fontSize:9,opacity:.35}}>🔒</span>
                                  </div>
                                :(msg.type==='file'||msg.mediaName)
                                ?<div style={{display:'flex',alignItems:'center',gap:8}}>
                                    <div style={{width:36,height:36,borderRadius:9,background:'rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{msg.mediaIcon||'📄'}</div>
                                    <div style={{minWidth:0}}>
                                      <div style={{fontSize:13,fontWeight:600,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:130}}>{msg.mediaName||msg.text}</div>
                                      <div style={{fontSize:10,color:'rgba(255,255,255,.45)',marginTop:1}}>Encrypted file · tap to open</div>
                                    </div>
                                  </div>
                                :<span>{msg.text}{msg.bc&&mine&&<span style={{fontSize:9,color:C.amber,marginLeft:5}}>📣</span>}<span style={{fontSize:9,opacity:.28,marginLeft:4}}>🔒</span></span>
                            }
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:5,marginTop:2,padding:'0 3px'}}>
                            <span style={{fontSize:10,color:C.muted}}>{msg.time}</span>
                            {mine&&<span style={{fontSize:10,color:msg.status==='delivered'||msg.status==='read'?C.rb:C.muted}}>{msg.status==='sent'?'✓':'✓✓'}</span>}
                            {msg.isRead&&msg.hasTtl&&<span style={{fontSize:10,fontWeight:700,color:crit?'#ff3333':C.red}}>{fmt(msg.ttl)}</span>}
                          </div>
                          {msg.isRead&&msg.hasTtl&&<div style={{width:80,height:2,background:C.s4,borderRadius:1,overflow:'hidden',marginTop:2}}><div style={{height:'100%',background:crit?'#ff3333':C.red,width:`${pct}%`,transition:'width 1s linear',borderRadius:1}}/></div>}
                        </div>
                      );
                    })
                  }
                </div>

                {/* Input Bar */}
                <div style={{borderTop:`1px solid ${C.border}`,background:C.s1,flexShrink:0}}>

                  {/* Media Tray */}
                  {mediaTray&&(
                    <div style={{padding:'12px 14px 8px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:12}}>
                      {[
                        {label:'Photo',icon:'🖼️',color:'rgba(59,130,246,.12)',stroke:C.blue,accept:'image/*',
                         svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>},
                        {label:'Video',icon:'🎬',color:'rgba(139,92,246,.12)',stroke:'#a78bfa',accept:'video/*',
                         svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>},
                        {label:'File',icon:'📄',color:'rgba(245,158,11,.12)',stroke:C.amber,accept:'*/*',
                         svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>},
                        {label:'Camera',icon:'📷',color:'rgba(34,197,94,.12)',stroke:C.green,accept:'image/*',capture:'camera',
                         svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>},
                      ].map(item=>(
                        <button key={item.label} onClick={()=>{
                          fileInputRef.current.accept=item.accept;
                          if(item.capture)fileInputRef.current.setAttribute('capture',item.capture);
                          else fileInputRef.current.removeAttribute('capture');
                          fileInputRef.current.click();
                        }} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,cursor:'pointer',border:'none',background:'transparent',flex:1}}>
                          <div style={{width:52,height:52,borderRadius:16,background:item.color,display:'flex',alignItems:'center',justifyContent:'center',color:item.stroke,border:`1px solid ${item.color.replace('.12)','.25)')}`}}>{item.svg}</div>
                          <span style={{fontSize:11,color:C.muted,fontFamily:F,fontWeight:600}}>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Media Preview */}
                  {mediaPreview&&(
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderBottom:`1px solid ${C.border}`,background:C.s2}}>
                      {mediaPreview.type==='image'
                        ?<img src={mediaPreview.url} style={{width:44,height:44,borderRadius:8,objectFit:'cover',flexShrink:0}}/>
                        :<div style={{width:44,height:44,borderRadius:8,background:C.s3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>{mediaPreview.icon}</div>
                      }
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{mediaPreview.name}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>{mediaPreview.size} · 🔒 E2E encrypted</div>
                      </div>
                      <button onClick={()=>setMediaPreview(null)} style={{width:26,height:26,borderRadius:'50%',background:C.s4,border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>✕</button>
                    </div>
                  )}

                  {/* Voice Recording Bar */}
                  {recording&&(
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:'rgba(204,0,0,.06)',borderBottom:`1px solid rgba(204,0,0,.2)`}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:C.red,animation:'rp 1s infinite',flexShrink:0}}/>
                      <div style={{display:'flex',alignItems:'center',gap:2,height:18,flex:1}}>
                        {Array.from({length:20},(_,i)=>(
                          <div key={i} style={{width:3,borderRadius:2,background:C.red,height:Math.random()*14+4,opacity:.7,animation:`rp ${0.4+Math.random()*.4}s ${Math.random()*.3}s ease-in-out infinite alternate`}}/>
                        ))}
                      </div>
                      <span style={{fontSize:13,color:C.red,fontWeight:700,fontFamily:'monospace',minWidth:34}}>{fmt(recSec)}</span>
                      <button onClick={()=>{clearInterval(recTimerRef.current);setRecording(false);setRecSec(0);}} style={{fontSize:11,color:C.muted,background:C.s3,border:`1px solid ${C.border}`,borderRadius:7,padding:'4px 10px',cursor:'pointer',fontFamily:F,fontWeight:600}}>Cancel</button>
                      <button onClick={()=>{
                        clearInterval(recTimerRef.current);
                        const dur=recSec;
                        setRecording(false);setRecSec(0);
                        const m={id:nid(),type:'audio',text:`🎙 Voice note · ${fmt(dur)}`,sender:view,time:now(),status:'sent',isRead:false,ttl:0,hasTtl:false,enc:rnd(6)+'…'+rnd(8),dur};
                        setConvs(p=>{const c={...p[activeConv]};c.messages=[...c.messages,m];c[view==='alice'?'uB':'uA']=(c[view==='alice'?'uB':'uA']||0)+1;return{...p,[activeConv]:c};});
                        setTimeout(()=>setConvs(p=>{const c={...p[activeConv]};c.messages=c.messages.map(x=>x.id===m.id?{...x,status:'delivered'}:x);return{...p,[activeConv]:c};}),700);
                      }} style={{fontSize:11,color:'#fff',background:C.red,border:'none',borderRadius:7,padding:'4px 12px',cursor:'pointer',fontFamily:F,fontWeight:700}}>Send</button>
                    </div>
                  )}

                  {/* Main input row */}
                  {!recording&&<div style={{padding:'8px 10px 10px',display:'flex',alignItems:'flex-end',gap:7}}>
                    {/* + attach button */}
                    <button onClick={()=>setMediaTray(t=>!t)} style={{minWidth:38,minHeight:38,borderRadius:19,border:`1px solid ${mediaTray?C.rsoft:C.border}`,background:mediaTray?C.rdim:'transparent',color:mediaTray?C.rb:C.muted,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s',flexShrink:0}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>

                    {/* Text input */}
                    <div style={{flex:1,display:'flex',alignItems:'flex-end',background:C.s3,border:`1px solid ${C.border}`,borderRadius:22,padding:'8px 12px',minHeight:40}}>
                      <textarea value={input} onChange={e=>{setInput(e.target.value);setMediaTray(false);}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(mediaPreview){const m={id:nid(),type:mediaPreview.type,text:input.trim()||`${mediaPreview.icon} ${mediaPreview.name}`,sender:view,time:now(),status:'sent',isRead:false,ttl:0,hasTtl:false,enc:rnd(6)+'…'+rnd(8),mediaName:mediaPreview.name,mediaUrl:mediaPreview.url,mediaIcon:mediaPreview.icon};setConvs(p=>{const c={...p[activeConv]};c.messages=[...c.messages,m];c[view==='alice'?'uB':'uA']=(c[view==='alice'?'uB':'uA']||0)+1;return{...p,[activeConv]:c};});setMediaPreview(null);setInput('');}else sendMsg(input);}}} placeholder="Message…" rows={1} style={{flex:1,background:'transparent',border:'none',color:C.white,fontFamily:F,fontSize:15,resize:'none',maxHeight:100,lineHeight:1.4}}/>
                    </div>

                    {/* Mic button (hold to record) */}
                    {!input.trim()&&!mediaPreview&&(
                      <button onMouseDown={()=>{setRecording(true);setRecSec(0);recTimerRef.current=setInterval(()=>setRecSec(s=>s+1),1000);}} onMouseUp={()=>{if(recSec<1){clearInterval(recTimerRef.current);setRecording(false);setRecSec(0);}}} onTouchStart={()=>{setRecording(true);setRecSec(0);recTimerRef.current=setInterval(()=>setRecSec(s=>s+1),1000);}} style={{minWidth:40,minHeight:40,borderRadius:20,background:C.s3,border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                      </button>
                    )}

                    {/* Send button */}
                    {(input.trim()||mediaPreview)&&(
                      <button onClick={()=>{
                        if(mediaPreview){
                          const m={id:nid(),type:mediaPreview.type,text:input.trim()||`${mediaPreview.icon} ${mediaPreview.name}`,sender:view,time:now(),status:'sent',isRead:false,ttl:0,hasTtl:false,enc:rnd(6)+'…'+rnd(8),mediaName:mediaPreview.name,mediaUrl:mediaPreview.url,mediaIcon:mediaPreview.icon};
                          setConvs(p=>{const c={...p[activeConv]};c.messages=[...c.messages,m];c[view==='alice'?'uB':'uA']=(c[view==='alice'?'uB':'uA']||0)+1;return{...p,[activeConv]:c};});
                          setMediaPreview(null);setInput('');
                          setTimeout(()=>setConvs(p=>{const c={...p[activeConv]};c.messages=c.messages.map(x=>x.id===m.id?{...x,status:'delivered'}:x);return{...p,[activeConv]:c};}),700);
                        }else sendMsg(input);
                      }} style={{minWidth:42,minHeight:42,borderRadius:21,background:C.red,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 2px 8px rgba(204,0,0,.4)`}}>
                        <SendIcon c="#fff"/>
                      </button>
                    )}
                  </div>}

                  <div style={{display:'flex',justifyContent:'space-between',padding:'0 14px 6px'}}>
                    <span style={{fontSize:10,color:C.muted2,fontWeight:600}}>{input.length>0||mediaPreview?`🔒 Signal · ${rnd(6)}…`:'🔒 Hold mic · tap + for media'}</span>
                    <span style={{fontSize:10,color:C.muted2}}>{input.length}/500</span>
                  </div>
                </div>
              </>}
            </div>
          </div>
        </div>

        {/* ══ CALLS ══ */}
        <div style={{...getTabStyle('calls'), display:'flex', flexDirection:'column'}}>
          <div style={{padding:'12px 14px 10px',background:C.s1,borderBottom:`1px solid ${C.border}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:22,fontWeight:800,letterSpacing:'-.03em'}}>Calls</span>
            <button onClick={()=>setNewMsgOpen(true)} style={{width:36,height:36,borderRadius:'50%',background:C.red,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><PhoneIcon stroke="white" w={16}/></button>
          </div>
          <div style={{overflowY:'auto',flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:'.06em',textTransform:'uppercase',padding:'12px 16px 5px'}}>Recent</div>
            {CALLS_HIST.map(call=>(
              <div key={call.id} style={{display:'flex',alignItems:'center',gap:11,padding:'11px 14px',borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}>
                <Av name={call.name} size={44}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:call.missed?C.rb:C.white}}>{call.name}</div>
                  <div style={{display:'flex',alignItems:'center',gap:5,marginTop:2}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke={call.missed?C.rb:call.type==='incoming'?C.green:C.blue}>
                      {call.type==='incoming'?<><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>:<><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></>}
                    </svg>
                    <span style={{fontSize:12,color:call.missed?C.rb:C.muted}}>{call.missed?'Missed':call.type==='incoming'?'Incoming':'Outgoing'}{call.dur?` · ${call.dur}`:''}</span>
                  </div>
                </div>
                <span style={{fontSize:11,color:C.muted,flexShrink:0}}>{call.time}</span>
                <button onClick={()=>startCall(call.name)} style={{width:34,height:34,borderRadius:'50%',background:C.rdim,border:`1px solid ${C.rsoft}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <PhoneIcon stroke={C.red} w={14}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ══ CONTACTS ══ */}
        <div style={{...getTabStyle('contacts'), display:'flex', flexDirection:'column'}}>
          <div style={{padding:'12px 14px 10px',background:C.s1,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <span style={{fontSize:22,fontWeight:800,letterSpacing:'-.03em'}}>Contacts</span>
              <button onClick={()=>setAddContactOpen(true)} style={{width:36,height:36,borderRadius:'50%',background:C.red,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 2px 8px rgba(204,0,0,.35)`}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              </button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8,background:C.s3,borderRadius:10,padding:'7px 11px',border:`1px solid ${C.border}`}}>
              <SearchIcon/><input value={cSearch} onChange={e=>setCSearch(e.target.value)} placeholder="Search contacts…" style={{flex:1,background:'transparent',border:'none',color:C.text,fontFamily:F,fontSize:14}}/>
            </div>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {Object.keys(ctGroups).sort().map(letter=>(
              <div key={letter}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:'.06em',textTransform:'uppercase',padding:'10px 16px 4px',position:'sticky',top:0,background:C.bg,zIndex:1}}>{letter}</div>
                {ctGroups[letter].map(contact=>(
                  <div key={contact.id} onClick={()=>setDetailContact(contact)} style={{display:'flex',alignItems:'center',gap:11,padding:'10px 14px',borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}>
                    <Av name={contact.name} size={44} online={contact.online}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.white}}>{contact.name}</div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{contact.phone}</div>
                    </div>
                    <div style={{display:'flex',gap:7,flexShrink:0}}>
                      <button onClick={e=>{e.stopPropagation();startCall(contact.name);}} style={{width:32,height:32,borderRadius:'50%',background:C.gdim,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><PhoneIcon stroke={C.green} w={14}/></button>
                      <button onClick={e=>{e.stopPropagation();startConv(contact);}} style={{width:32,height:32,borderRadius:'50%',background:C.rdim,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><MsgIcon stroke={C.rb} w={14}/></button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ══ PROFILE ══ */}
        <div style={{...getTabStyle('profile'), overflowY:'auto'}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'28px 20px 20px',gap:8,borderBottom:`1px solid ${C.border}`}}>
            <div style={{position:'relative',cursor:'pointer'}}>
              <Av name={view==='alice'?'Alice':'Bob'} size={80}/>
              <div style={{position:'absolute',bottom:2,right:2,width:26,height:26,borderRadius:'50%',background:C.red,border:`2.5px solid ${C.bg}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </div>
            </div>
            <div style={{fontSize:24,fontWeight:800,color:C.white,letterSpacing:'-.03em'}}>{view==='alice'?'Alice':'Bob'}</div>
            <div style={{fontSize:13,color:C.muted}}>+221 77 000 0000</div>
            <div style={{fontSize:12,color:C.text2,fontStyle:'italic'}}>🔒 Privacy first.</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',borderBottom:`1px solid ${C.border}`}}>
            {[{v:allMsgs,l:'Messages',r:true},{v:convList.length,l:'Chats'},{v:CALLS_HIST.length,l:'Calls'}].map(s=>(
              <div key={s.l} style={{padding:'15px 0',display:'flex',flexDirection:'column',alignItems:'center',gap:3,borderRight:`1px solid ${C.border}`}}>
                <div style={{fontSize:22,fontWeight:800,color:s.r?C.rb:C.white}}>{s.v}</div>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:'.06em',textTransform:'uppercase'}}>{s.l}</div>
              </div>
            ))}
          </div>
          {/* Settings */}
          <div style={{padding:'16px 0'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:'.08em',textTransform:'uppercase',padding:'0 16px 8px'}}>Security</div>
            <div style={{background:C.s1,borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
              {[{k:'ss',l:'Block Screenshots',sub:'Prevent capture in chats',icon:'🛡️',bg:C.red},{k:'ra',l:'Read Receipts',sub:'Alert when message opened',icon:'👁',bg:C.rd},{k:'bio',l:'Face ID Lock',sub:'Required on app open',icon:'🔐',bg:C.s4},{k:'sca',l:'Screenshot Alerts',sub:'Notify when contact screenshots',icon:'📸',bg:C.red},{k:'snd',l:'Notification Sounds',sub:'Sound for new messages',icon:'🔔',bg:C.amber}].map(row=>(
                <div key={row.k} style={{display:'flex',alignItems:'center',gap:11,padding:'13px 16px',borderBottom:`1px solid ${C.border}`}}>
                  <div style={{width:34,height:34,borderRadius:10,background:row.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{row.icon}</div>
                  <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500,color:C.text}}>{row.l}</div><div style={{fontSize:11,color:C.muted,marginTop:1}}>{row.sub}</div></div>
                  <Tog on={settings[row.k]} onToggle={()=>setSettings(p=>({...p,[row.k]:!p[row.k]}))}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{padding:'0 0 16px'}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:'.08em',textTransform:'uppercase',padding:'8px 16px'}}>Account</div>
            <div style={{background:C.s1,borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
              {[{icon:'📱',l:'Phone Number',val:'+221 77 000 0000'},{icon:'🔑',l:'Encryption Key',val:'Verified ✓'},{icon:'ℹ️',l:'About VanishText',val:'v2.0'}].map(row=>(
                <div key={row.l} style={{display:'flex',alignItems:'center',gap:11,padding:'13px 16px',borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}>
                  <div style={{width:34,height:34,borderRadius:10,background:C.s3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{row.icon}</div>
                  <div style={{flex:1,fontSize:14,fontWeight:500,color:C.text}}>{row.l}</div>
                  <span style={{fontSize:12,color:C.muted}}>{row.val}</span><span style={{color:C.muted2,fontSize:16,marginLeft:4}}>›</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{padding:'0 16px 32px',display:'flex',flexDirection:'column',gap:10}}>
            {['Log Out','Delete Account'].map(label=>(
              <div key={label} style={{padding:'13px 16px',background:C.s1,border:'1px solid rgba(255,50,50,.15)',borderRadius:11,display:'flex',alignItems:'center',gap:11,cursor:'pointer'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff3333" strokeWidth="2" strokeLinecap="round">
                  {label==='Log Out'?<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>:<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>}
                </svg>
                <span style={{fontSize:14,fontWeight:600,color:'#ff3333'}}>{label}</span>
              </div>
            ))}
            <div style={{textAlign:'center',fontSize:10,color:C.muted2,paddingTop:4}}>VanishText v2.0 · Signal Protocol X3DH + Double Ratchet · AES-256-GCM</div>
          </div>
        </div>

        {/* ══ CALL OVERLAY ══ */}
        {callOverlay&&(
          <div style={{position:'absolute',inset:0,zIndex:80,background:'rgba(8,8,10,.95)',display:'flex',flexDirection:'column',backgroundImage:'radial-gradient(ellipse at 50% 30%, rgba(139,0,0,.2) 0%, transparent 65%)'}}>
            <div style={{padding:'32px 20px 0',display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
              <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,.4)',letterSpacing:'.1em',textTransform:'uppercase'}}>{callConn?'Connected · E2E Encrypted':'Calling…'}</div>
              <div style={{fontSize:28,fontWeight:800,color:'#fff',letterSpacing:'-.03em',textAlign:'center'}}>{callOverlay.name}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,.35)'}}>VanishText · Signal Protocol</div>
            </div>
            <div style={{display:'flex',justifyContent:'center',margin:'24px 0 16px'}}>
              <div style={{position:'relative'}}>
                <div style={{position:'absolute',inset:-10,borderRadius:'50%',border:'1.5px solid rgba(204,0,0,.22)',animation:'rp 2.5s infinite'}}/>
                <div style={{position:'absolute',inset:-20,borderRadius:'50%',border:'1px solid rgba(204,0,0,.12)',animation:'rp 2.5s .6s infinite'}}/>
                <Av name={callOverlay.name} size={92}/>
              </div>
            </div>
            {callConn&&<div style={{textAlign:'center',fontSize:22,fontWeight:300,color:'rgba(255,255,255,.7)',letterSpacing:'.1em',marginBottom:8}}>{fmt(callSec)}</div>}
            <div style={{marginTop:'auto',padding:'20px 20px 24px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
              {[
                {id:'mute',label:ctrls.mute?'Unmute':'Mute',icon:<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.2 1.6"/><line x1="12" y1="19" x2="12" y2="23"/></svg>},
                {id:'spk',label:'Speaker',icon:<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>},
                {id:'vid',label:'Video',icon:<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>},
              ].map(ctrl=>(
                <button key={ctrl.id} onClick={()=>setCtrls(p=>({...p,[ctrl.id]:!p[ctrl.id]}))} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,cursor:'pointer',border:'none',background:'transparent'}}>
                  <div style={{width:52,height:52,borderRadius:'50%',background:ctrls[ctrl.id]?'#fff':C.s3,border:`1px solid ${ctrls[ctrl.id]?'transparent':C.b2}`,display:'flex',alignItems:'center',justifyContent:'center',color:ctrls[ctrl.id]?C.bg:'#fff'}}>{ctrl.icon}</div>
                  <span style={{fontSize:10,color:'rgba(255,255,255,.45)',fontFamily:F,fontWeight:600}}>{ctrl.label}</span>
                </button>
              ))}
              <button onClick={endCall} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,cursor:'pointer',border:'none',background:'transparent'}}>
                <div style={{width:62,height:62,borderRadius:'50%',background:C.red,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 4px 18px rgba(204,0,0,.45)`}}><PhoneIcon stroke="white" w={24}/></div>
                <span style={{fontSize:10,color:'#ff6666',fontFamily:F,fontWeight:600}}>End</span>
              </button>
            </div>
          </div>
        )}

        {/* ══ ADD CONTACT OVERLAY ══ */}
        {addContactOpen&&(
          <div onClick={()=>setAddContactOpen(false)} style={{position:'absolute',inset:0,zIndex:90,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'flex-end'}}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.s1,borderRadius:'18px 18px 0 0',width:'100%',padding:'24px 20px 40px',display:'flex',flexDirection:'column',borderTop:`1px solid ${C.b2}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
                <span style={{fontSize:20,fontWeight:800,color:C.white}}>New Contact</span>
                <button onClick={()=>setAddContactOpen(false)} style={{background:C.s3,border:'none',width:28,height:28,borderRadius:'50%',color:C.muted,fontSize:12,cursor:'pointer'}}>✕</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                <div style={{background:C.s3,borderRadius:12,padding:'8px 14px',border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:2,textTransform:'uppercase',letterSpacing:1}}>Phone Number</div>
                  <input type="tel" autoFocus value={newContactPhone} onChange={e=>setNewContactPhone(e.target.value)} placeholder="+1 234 567 8900" style={{width:'100%',background:'transparent',border:'none',color:'#fff',fontSize:16,outline:'none',fontFamily:F}} />
                </div>
                <div style={{background:C.s3,borderRadius:12,padding:'8px 14px',border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:2,textTransform:'uppercase',letterSpacing:1}}>Name</div>
                  <input type="text" value={newContactName} onChange={e=>setNewContactName(e.target.value)} placeholder="John Doe" style={{width:'100%',background:'transparent',border:'none',color:'#fff',fontSize:16,outline:'none',fontFamily:F}} />
                </div>
                <button onClick={()=>{
                  if(!newContactName.trim() || !newContactPhone.trim()) return;
                  const newCt = { id:nid(), name:newContactName.trim(), phone:newContactPhone.trim(), online:true };
                  setContactsState(p=>[...p, newCt].sort((a,b)=>a.name.localeCompare(b.name)));
                  setAddContactOpen(false);
                  setNewContactName('');
                  setNewContactPhone('');
                  pushN('m','✅','Contact Saved',newCt.name);
                }} style={{width:'100%',padding:'14px',borderRadius:12,background:(!newContactName.trim()||!newContactPhone.trim())?C.s4:C.red,color:(!newContactName.trim()||!newContactPhone.trim())?C.muted:'#fff',fontSize:15,fontWeight:700,border:'none',marginTop:8,cursor:(!newContactName.trim()||!newContactPhone.trim())?'not-allowed':'pointer'}}>Save Contact</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ CONTACT DETAIL ══ */}
        {detailContact&&(
          <div onClick={()=>setDetailContact(null)} style={{position:'absolute',inset:0,zIndex:70,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'flex-end'}}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.s1,borderRadius:'18px 18px 0 0',width:'100%',borderTop:`1px solid ${C.b2}`}}>
              <div style={{width:36,height:3,background:C.s3,borderRadius:2,margin:'10px auto'}}/>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'14px 20px 16px',gap:7}}>
                <Av name={detailContact.name} size={76} online={detailContact.online}/>
                <div style={{fontSize:22,fontWeight:800,color:C.white,letterSpacing:'-.03em'}}>{detailContact.name}</div>
                <div style={{fontSize:13,color:C.muted}}>{detailContact.phone}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,padding:'0 20px 16px'}}>
                {[
                  {label:'Message',bg:C.rdim,color:C.rb,icon:<MsgIcon stroke="currentColor" w={20}/>,action:()=>{startConv(detailContact);setDetailContact(null);}},
                  {label:'Call',bg:C.gdim,color:C.green,icon:<PhoneIcon stroke="currentColor" w={20}/>,action:()=>{startCall(detailContact.name);setDetailContact(null);}},
                  {label:'Video',bg:C.bdim,color:C.blue,icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,action:()=>setDetailContact(null)},
                ].map(btn=>(
                  <button key={btn.label} onClick={btn.action} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,cursor:'pointer',border:'none',background:'transparent'}}>
                    <div style={{width:52,height:52,borderRadius:'50%',background:btn.bg,color:btn.color,display:'flex',alignItems:'center',justifyContent:'center'}}>{btn.icon}</div>
                    <span style={{fontSize:11,color:C.muted,fontFamily:F,fontWeight:700}}>{btn.label}</span>
                  </button>
                ))}
              </div>
              <div style={{height:1,background:C.border,margin:'0 16px 12px'}}/>
              <div style={{padding:'0 16px 24px'}}>
                <button style={{width:'100%',padding:'13px',background:'rgba(255,50,50,.08)',border:'1px solid rgba(255,50,50,.18)',borderRadius:11,color:'#ff3333',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:F}} onClick={()=>setDetailContact(null)}>Block Contact</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ NEW MESSAGE MODAL ══ */}
        {newMsgOpen&&(
          <div onClick={()=>{setNewMsgOpen(false);setBcMode(false);setSelected(new Set());}} style={{position:'absolute',inset:0,zIndex:60,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'flex-end'}}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.s1,borderRadius:'18px 18px 0 0',width:'100%',maxHeight:'88%',display:'flex',flexDirection:'column',borderTop:`1px solid ${C.b2}`}}>
              <div style={{width:36,height:3,background:C.s3,borderRadius:2,margin:'10px auto',flexShrink:0}}/>
              {!bcMode?(
                <>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px 12px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                    <span style={{fontSize:18,fontWeight:800,color:C.white}}>New Message</span>
                    <button onClick={()=>setNewMsgOpen(false)} style={{width:30,height:30,borderRadius:'50%',background:C.s3,border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontSize:13}}>✕</button>
                  </div>
                  <div style={{overflowY:'auto',flex:1}}>
                    {CONTACTS.map(c=>(
                      <div key={c.id} onClick={()=>{const s=new Set(selected);s.has(c.id)?s.delete(c.id):s.add(c.id);setSelected(s);}} style={{display:'flex',alignItems:'center',gap:11,padding:'11px 16px',borderTop:`1px solid ${C.border}`,cursor:'pointer',background:selected.has(c.id)?C.rglow:'transparent'}}>
                        <Av name={c.name} size={44} online={c.online}/>
                        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:C.white}}>{c.name}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{c.phone}</div></div>
                        <div style={{width:24,height:24,borderRadius:'50%',border:`2px solid ${selected.has(c.id)?C.red:C.b2}`,background:selected.has(c.id)?C.red:'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#fff',fontWeight:800,transition:'all .15s'}}>{selected.has(c.id)?'✓':''}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{padding:'10px 14px 20px',borderTop:`1px solid ${C.border}`,display:'flex',gap:10,flexShrink:0}}>
                    <button onClick={()=>setNewMsgOpen(false)} style={{flex:1,padding:12,borderRadius:11,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:F,background:C.s3,border:`1px solid ${C.border}`,color:C.muted}}>Cancel</button>
                    {selected.size>0&&<span style={{fontSize:12,color:C.rb,fontWeight:700,alignSelf:'center',flexShrink:0}}>{selected.size} selected</span>}
                    <button disabled={selected.size===0} onClick={()=>{if(selected.size===1){const id=[...selected][0];const ct=CONTACTS.find(c=>c.id===id);if(ct)startConv(ct);}else setBcMode(true);}} style={{flex:1,padding:12,borderRadius:11,fontSize:14,fontWeight:700,cursor:selected.size>0?'pointer':'not-allowed',fontFamily:F,background:selected.size>0?C.red:C.s3,color:'#fff',border:'none',opacity:selected.size>0?1:.4}}>
                      {selected.size>1?`Broadcast to ${selected.size} →`:'Start'}
                    </button>
                  </div>
                </>
              ):(
                <>
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px 12px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                    <button onClick={()=>setBcMode(false)} style={{background:'transparent',border:'none',color:C.rb,fontSize:22,cursor:'pointer'}}>‹</button>
                    <div style={{flex:1}}><div style={{fontSize:17,fontWeight:800,color:C.white}}>Broadcast</div><div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase',marginTop:1}}>To {selected.size} contacts</div></div>
                    <span style={{fontSize:9,fontWeight:700,color:C.red,background:C.rdim,padding:'2px 7px',borderRadius:4,border:`1px solid ${C.rsoft}`}}>🔒 E2E</span>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:5,padding:'9px 14px',borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                    {[...selected].map(id=>{const ct=CONTACTS.find(x=>x.id===id);if(!ct)return null;const col=avC(ct.name);return <div key={id} style={{display:'inline-flex',alignItems:'center',gap:4,background:C.rdim,border:`1px solid ${C.rsoft}`,borderRadius:20,padding:'3px 8px 3px 4px'}}><div style={{width:18,height:18,borderRadius:'50%',background:col.bg,color:col.fg,fontSize:7,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{ini(ct.name)}</div><span style={{fontSize:11,fontWeight:700,color:C.rb}}>{ct.name.split(' ')[0]}</span><span onClick={()=>{const s=new Set(selected);s.delete(id);setSelected(s);if(s.size===0)setBcMode(false);}} style={{fontSize:10,color:C.red,cursor:'pointer',opacity:.6}}>✕</span></div>;})}
                  </div>
                  <div style={{flex:1,display:'flex',flexDirection:'column',padding:'11px 14px',gap:9}}>
                    <div style={{flex:1,background:C.s3,border:`1px solid ${C.border}`,borderRadius:13,padding:'11px 13px',display:'flex',flexDirection:'column',gap:7}}>
                      <textarea value={bcText} onChange={e=>setBcText(e.target.value)} placeholder="Your message…" style={{flex:1,background:'transparent',border:'none',color:C.white,fontFamily:F,fontSize:15,resize:'none',minHeight:80,lineHeight:1.5}}/>
                      
                      {mediaPreview&&(
                        <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 8px',background:C.s2,borderRadius:8,marginBottom:2}}>
                          <div style={{width:26,height:26,borderRadius:6,background:C.s4,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>{mediaPreview.icon}</div>
                          <div style={{flex:1,minWidth:0,fontSize:11,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{mediaPreview.name}</div>
                          <button onClick={()=>setMediaPreview(null)} style={{width:20,height:20,borderRadius:'50%',background:C.s4,border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontSize:10,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
                        </div>
                      )}

                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <button onClick={()=>{fileInputRef.current.accept='*/*';fileInputRef.current.removeAttribute('capture');fileInputRef.current.click();}} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.06)',border:`1px solid ${C.border}`,borderRadius:10,padding:'6px 10px',color:C.white,cursor:'pointer',transition:'all .15s'}}>
                            <span style={{fontSize:18}}>📁</span>
                            <span style={{fontSize:12,fontWeight:700,fontFamily:F}}>File</span>
                          </button>
                          
                          <button onClick={()=>{
                            if(recording){
                              clearInterval(recTimerRef.current);
                              if(recSec>0) setMediaPreview({type:'audio',name:`Voice note · ${fmt(recSec)}`,icon:'🎙️',size:'Audio',dur:recSec});
                              setRecording(false);setRecSec(0);
                            }else{
                              setRecording(true);setRecSec(0);
                              recTimerRef.current=setInterval(()=>setRecSec(s=>s+1),1000);
                            }
                          }} style={{display:'flex',alignItems:'center',gap:6,background:recording?'rgba(204,0,0,.15)':'rgba(255,255,255,.06)',border:`1px solid ${recording?'rgba(204,0,0,.3)':C.border}`,borderRadius:10,padding:'6px 10px',color:recording?C.red:C.white,cursor:'pointer',transition:'all .15s'}}>
                            <span style={{fontSize:18}}>{recording?'🔴':'🎙️'}</span>
                            <span style={{fontSize:12,fontWeight:700,fontFamily:F}}>{recording?fmt(recSec):'Audio'}</span>
                          </button>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:10,color:C.muted2,fontWeight:600}}>🔒 AES-GCM</span>
                          <span style={{fontSize:10,color:C.muted2}}>{bcText.length}/500</span>
                        </div>
                      </div>
                    </div>
                    <div style={{background:C.adim,border:'1px solid rgba(245,158,11,.2)',borderRadius:10,padding:'8px 11px',display:'flex',gap:7}}>
                      <span style={{fontSize:14,flexShrink:0}}>📣</span>
                      <div style={{fontSize:11,color:C.muted,lineHeight:1.55}}>Sent <strong style={{color:C.amber}}>individually</strong>. Files vanish 3 min after viewing.</div>
                    </div>
                  </div>
                  <div style={{padding:'10px 14px 22px',borderTop:`1px solid ${C.border}`,flexShrink:0}}>
                    <button disabled={!bcText.trim()&&!mediaPreview} onClick={sendBc} style={{width:'100%',padding:'13px',borderRadius:12,fontSize:15,fontWeight:700,cursor:(bcText.trim()||mediaPreview)?'pointer':'not-allowed',fontFamily:F,background:(bcText.trim()||mediaPreview)?C.red:C.s3,color:'#fff',border:'none',opacity:(bcText.trim()||mediaPreview)?1:.35}}>Send to {selected.size} contacts</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* TAB BAR */}
      <div style={{height:56,background:C.s1,borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'stretch',flexShrink:0}}>
        {[
          {id:'chats',label:'Chats',dot:hasUnread,icon:a=><MsgIcon stroke={a?C.red:C.muted} w={22}/>},
          {id:'calls',label:'Calls',dot:false,icon:a=><PhoneIcon stroke={a?C.red:C.muted} w={22}/>},
          {id:'contacts',label:'Contacts',dot:false,icon:a=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?C.red:C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>},
          {id:'profile',label:'Profile',dot:false,icon:a=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?C.red:C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>},
        ].map(t=>{
          const a=tab===t.id;
          return (
            <button key={t.id} onClick={()=>{setTab(t.id);if(t.id!=='chats')setActiveConv(null);}} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,cursor:'pointer',border:'none',background:'transparent',position:'relative',padding:0}}>
              <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:24,height:2,background:C.red,borderRadius:'0 0 2px 2px',opacity:a?1:0,transition:'opacity .2s'}}/>
              {t.dot&&<div style={{position:'absolute',top:7,right:'calc(50% - 18px)',width:7,height:7,borderRadius:'50%',background:C.red,border:`2px solid ${C.s1}`}}/>}
              {t.icon(a)}
              <span style={{fontSize:10,fontWeight:600,color:a?C.red:C.muted,letterSpacing:'.03em',fontFamily:F,transition:'color .2s'}}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
