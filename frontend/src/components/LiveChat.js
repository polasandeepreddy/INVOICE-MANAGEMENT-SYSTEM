import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';

const POLL_MS = 3000;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
const ALL = 'all'; // thread key for broadcast messages

const fmtTime = (ts) => {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const displayName = (u) => u.full_name || u.username || 'User';

// Thread a message belongs to, from the current user's point of view.
const threadOf = (msg, myId) => {
  if (msg.recipient_id === null || msg.recipient_id === undefined) return ALL;
  return msg.sender_id === myId ? msg.recipient_id : msg.sender_id;
};

/* Polls the server (also while the chat window is closed, so delivery ticks and the unread badge work). */
export const useLiveChat = (user, activeThread, isVisible) => {
  const myId = user?.id;
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [seen, setSeen] = useState({}); // thread -> last seen incoming message id (drives unread badges)
  const [statuses, setStatuses] = useState({}); // my message id -> 'sent' | 'delivered' | 'read'
  const [connError, setConnError] = useState('');
  const [tabActive, setTabActive] = useState(() => document.visibilityState !== 'hidden');
  const lastIdRef = useRef(0);
  const usersRef = useRef([]);
  const reportedRef = useRef({}); // thread -> last incoming id already reported as read to the server
  const seenKey = `ja-chat-seen-${myId}`;

  useEffect(() => {
    const onVis = () => setTabActive(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!myId) return undefined;
    setMessages([]);
    setUsers([]);
    setStatuses({});
    setConnError('');
    usersRef.current = [];
    reportedRef.current = {};
    lastIdRef.current = 0;
    try { setSeen(JSON.parse(localStorage.getItem(seenKey)) || {}); } catch { setSeen({}); }

    let stopped = false;
    const loadUsers = async () => {
      try {
        const res = await axios.get('/api/chat/users', authHeaders());
        if (stopped) return;
        usersRef.current = res.data?.users || [];
        setUsers(usersRef.current);
      } catch { /* retried on the next interval */ }
    };
    const poll = async () => {
      try {
        const res = await axios.get(`/api/chat/messages?after=${lastIdRef.current}`, authHeaders());
        if (stopped) return;
        setConnError('');
        if (res.data?.statuses) setStatuses(res.data.statuses);
        const fresh = res.data?.messages || [];
        if (fresh.length === 0) return;
        lastIdRef.current = fresh[fresh.length - 1].id;
        setMessages(prev => [...prev, ...fresh.filter(m => !prev.some(p => p.id === m.id))]);
        // A message from someone we don't know yet (new user): refresh the contact list now.
        if (fresh.some(m => m.sender_id !== myId && !usersRef.current.some(u => u.id === m.sender_id))) loadUsers();
      } catch (err) {
        if (stopped) return;
        const code = err.response?.status;
        setConnError(code === 404 ? 'Chat is not available on the server yet — restart the backend.'
          : code === 401 || code === 403 ? 'Session expired — please log in again.'
          : 'Reconnecting to chat…');
      }
    };
    loadUsers();
    poll();
    const t = setInterval(poll, POLL_MS);
    const u = setInterval(loadUsers, 20000);
    return () => { stopped = true; clearInterval(t); clearInterval(u); };
  }, [myId, seenKey]);

  // Latest incoming (not sent by me) message id per thread.
  const latestIncoming = useMemo(() => {
    const out = {};
    messages.forEach(m => {
      if (m.sender_id === myId) return;
      const th = threadOf(m, myId);
      if (m.id > (out[th] || 0)) out[th] = m.id;
    });
    return out;
  }, [messages, myId]);

  // The conversation is on screen (chat window open, on that thread, browser tab in front):
  // clear its unread badge and tell the server so the sender gets blue ticks.
  useEffect(() => {
    if (!myId || !isVisible || !tabActive || !activeThread) return;
    const latest = latestIncoming[activeThread] || 0;
    if (!latest) return;
    if ((reportedRef.current[activeThread] || 0) < latest) {
      reportedRef.current[activeThread] = latest;
      axios.post('/api/chat/read', { thread: activeThread }, authHeaders())
        .catch(() => { reportedRef.current[activeThread] = 0; }); // retry on the next update
    }
    if ((seen[activeThread] || 0) < latest) {
      const next = { ...seen, [activeThread]: latest };
      setSeen(next);
      try { localStorage.setItem(seenKey, JSON.stringify(next)); } catch { /* ignore */ }
    }
  }, [latestIncoming, activeThread, isVisible, tabActive, myId, seen, seenKey]);

  const unreadByThread = useMemo(() => {
    const out = {};
    messages.forEach(m => {
      if (m.sender_id === myId) return;
      const th = threadOf(m, myId);
      if (m.id > (seen[th] || 0)) out[th] = (out[th] || 0) + 1;
    });
    return out;
  }, [messages, seen, myId]);

  const totalUnread = Object.values(unreadByThread).reduce((a, b) => a + b, 0);

  const send = useCallback(async (recipientId, body) => {
    const res = await axios.post('/api/chat/messages', { recipient_id: recipientId === ALL ? null : recipientId, body }, authHeaders());
    const msg = res.data.message;
    lastIdRef.current = Math.max(lastIdRef.current, msg.id);
    setMessages(prev => (prev.some(p => p.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  return { users, messages, statuses, connError, unreadByThread, totalUnread, send };
};

// WhatsApp-style receipts: ✓ sent, ✓✓ delivered (recipient has the site open), blue ✓✓ read.
const Ticks = ({ status }) => (
  <span
    className={`ja-lc-tick ${status}`}
    title={status === 'read' ? 'Read' : status === 'delivered' ? 'Delivered' : 'Sent'}
  >
    {status === 'sent' ? '✓' : '✓✓'}
  </span>
);

export const LiveChatPanel = ({ user, chat, activeThread, setActiveThread }) => {
  const { users, messages, statuses, connError, unreadByThread, send } = chat;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  const thread = activeThread ? messages.filter(m => threadOf(m, user.id) === activeThread) : [];
  const peer = users.find(u => u.id === activeThread);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.length, activeThread]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      await send(activeThread, body);
      setText('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const lastInThread = (key) => {
    const list = messages.filter(m => threadOf(m, user.id) === key);
    return list.length ? list[list.length - 1] : null;
  };

  return (
    <>
      <style>{`
        .ja-lc { display: flex; flex: 1; min-height: 0; background: #efeae2; }
        .ja-lc-list { width: 128px; flex-shrink: 0; background: #fff; border-right: 1px solid #e2e8f0; overflow-y: auto; }
        .ja-lc-item { display: flex; align-items: center; gap: 6px; padding: 9px 8px; cursor: pointer; border-bottom: 1px solid #f1f5f9; position: relative; }
        .ja-lc-item:hover { background: #f8fafc; }
        .ja-lc-item.active { background: #e0f2fe; }
        .ja-lc-av { width: 28px; height: 28px; border-radius: 50%; background: #0072bc; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700; flex-shrink: 0; }
        .ja-lc-av.all { background: #16a34a; }
        .ja-lc-nm { font-size: 0.72rem; font-weight: 600; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ja-lc-pv { font-size: 0.62rem; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ja-lc-badge { margin-left: auto; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 9999px; background: #25d366; color: #fff; font-size: 0.62rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        .ja-lc-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .ja-lc-head { padding: 8px 12px; background: #f0f2f5; border-bottom: 1px solid #e2e8f0; font-size: 0.78rem; font-weight: 700; color: #0f172a; }
        .ja-lc-head small { display: block; font-weight: 500; color: #64748b; font-size: 0.64rem; }
        .ja-lc-msgs { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
        .ja-lc-msg { max-width: 85%; padding: 6px 9px; border-radius: 8px; font-size: 0.78rem; line-height: 1.4; word-break: break-word; white-space: pre-wrap; box-shadow: 0 1px 1px rgba(0,0,0,.08); }
        .ja-lc-msg.me { align-self: flex-end; background: #d9fdd3; border-top-right-radius: 2px; }
        .ja-lc-msg.them { align-self: flex-start; background: #fff; border-top-left-radius: 2px; }
        .ja-lc-who { font-size: 0.64rem; font-weight: 700; color: #0072bc; margin-bottom: 1px; }
        .ja-lc-ts { font-size: 0.58rem; color: #94a3b8; text-align: right; margin-top: 2px; }
        .ja-lc-tick { margin-left: 4px; font-size: 0.66rem; font-weight: 700; letter-spacing: -2px; color: #94a3b8; }
        .ja-lc-tick.read { color: #53bdeb; }
        .ja-lc-empty { margin: auto; text-align: center; color: #64748b; font-size: 0.74rem; padding: 0 16px; }
        .ja-lc-foot { padding: 8px; background: #f0f2f5; display: flex; gap: 6px; align-items: flex-end; }
        .ja-lc-input { flex: 1; resize: none; max-height: 80px; padding: 8px 12px; border: none; border-radius: 18px; font-size: 0.78rem; outline: none; font-family: inherit; }
        .ja-lc-send { width: 34px; height: 34px; border-radius: 50%; border: none; background: #25d366; color: #fff; cursor: pointer; flex-shrink: 0; }
        .ja-lc-send:disabled { opacity: .5; cursor: not-allowed; }
        .ja-lc-err { color: #b91c1c; font-size: 0.66rem; padding: 2px 10px; background: #f0f2f5; }
      `}</style>
      <div className="ja-lc">
        <div className="ja-lc-list">
          {[{ id: ALL, name: 'Everyone' }, ...users.map(u => ({ id: u.id, name: displayName(u) }))].map(c => {
            const last = lastInThread(c.id);
            return (
              <div key={c.id} className={`ja-lc-item ${activeThread === c.id ? 'active' : ''}`} onClick={() => setActiveThread(c.id)}>
                <div className={`ja-lc-av ${c.id === ALL ? 'all' : ''}`}>{c.id === ALL ? '📢' : c.name.charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="ja-lc-nm">{c.name}</div>
                  {last && <div className="ja-lc-pv">{last.body}</div>}
                </div>
                {unreadByThread[c.id] > 0 && <span className="ja-lc-badge">{unreadByThread[c.id]}</span>}
              </div>
            );
          })}
        </div>

        <div className="ja-lc-main">
          {connError && <div className="ja-lc-err">{connError}</div>}
          {!activeThread ? (
            <div className="ja-lc-empty">Choose <b>Everyone</b> or a person on the left to start messaging 💬</div>
          ) : (<>
          <div className="ja-lc-head">
            {activeThread === ALL ? 'Everyone' : peer ? displayName(peer) : 'Select a chat'}
            <small>{activeThread === ALL ? 'Visible to all users' : 'Private — only you and this person can see it'}</small>
          </div>
          <div className="ja-lc-msgs">
            {thread.length === 0 && <div className="ja-lc-empty">No messages yet. Say hello 👋</div>}
            {thread.map(m => {
              const mine = m.sender_id === user.id;
              return (
                <div key={m.id} className={`ja-lc-msg ${mine ? 'me' : 'them'}`}>
                  {!mine && activeThread === ALL && <div className="ja-lc-who">{m.sender_name || 'User'}</div>}
                  {m.body}
                  <div className="ja-lc-ts">
                    {fmtTime(m.created_at)}
                    {mine && <Ticks status={statuses[m.id] || 'sent'} />}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          {error && <div className="ja-lc-err">{error}</div>}
          <div className="ja-lc-foot">
            <textarea
              className="ja-lc-input"
              rows={1}
              placeholder={activeThread === ALL ? 'Message everyone…' : 'Type a message…'}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={2000}
            />
            <button className="ja-lc-send" onClick={handleSend} disabled={!text.trim() || sending} title="Send">➤</button>
          </div>
          </>)}
        </div>
      </div>
    </>
  );
};

export { ALL as ALL_THREAD };
