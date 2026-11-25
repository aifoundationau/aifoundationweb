// AI Foundation - Annual Membership card and Members Chat (server: membership.js, routes /api/membership*, /api/members-chat)
// window.fetch adds the Firebase ID token to /api/ requests (firebase-client.js), so no token handling here.
(() => {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const els = {
        section: $('membershipSection'), state: $('membershipState'), msg: $('membershipMsg'),
        join: $('membershipJoinBtn'), chat: $('membershipChatBtn'), telegram: $('membershipTelegramLink'), manage: $('membershipManageBtn'),
        dialog: $('membersChatDialog'), topics: $('membersChatTopics'), log: $('membersChatLog'),
        form: $('membersChatForm'), input: $('membersChatInput'), send: $('membersChatSend'), chatMsg: $('membersChatMsg'),
        chatTelegram: $('membersChatTelegramLink'), search: $('membersChatSearch'), searchCount: $('membersChatSearchCount')
    };
    if (!els.section) return;

    let status = null;
    let currentTopic = 'joint-projects';
    let canModerate = false;
    let pollTimer = null;

    const currentUser = () => (window.firebaseService && window.firebaseService.getCurrentUser) ? window.firebaseService.getCurrentUser() : null;
    const setMsg = (el, text, isError) => { el.textContent = text || ''; el.classList.toggle('is-error', Boolean(isError)); };
    const show = (el, on) => { if (el) el.hidden = !on; };

    async function api(url, options = {}) {
        const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
        return data;
    }

    function formatDate(iso) {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function render() {
        const signedIn = Boolean(currentUser());
        const member = Boolean(status && status.isMember);
        show(els.join, !member);
        els.join.querySelector('span').textContent = signedIn ? 'Join for $90/year' : 'Sign in to join';
        show(els.chat, member);
        show(els.telegram, member && Boolean(status.telegramUrl));
        if (member && status.telegramUrl) els.telegram.href = status.telegramUrl;
        show(els.chatTelegram, member && Boolean(status.telegramUrl));
        if (els.chatTelegram && member && status.telegramUrl) els.chatTelegram.href = status.telegramUrl;
        const complimentary = Boolean(status && status.status === 'complimentary');
        show(els.manage, Boolean(status && status.status !== 'none' && !complimentary));
        if (complimentary) {
            els.state.textContent = 'Complimentary SuperAdmin membership · no charge';
        } else if (member) {
            const end = formatDate(status.currentPeriodEnd);
            els.state.textContent = status.cancelAtPeriodEnd ? `Member until ${end} (not renewing)` : `Active member · renews ${end}`;
        } else if (status && status.status === 'past_due') {
            els.state.textContent = 'Your renewal payment failed. Update your card in Manage membership to restore access.';
        } else {
            els.state.textContent = '';
        }
    }

    async function loadStatus() {
        if (!currentUser()) { status = null; render(); return; }
        try {
            status = await api('/api/membership');
        } catch (e) {
            status = null;
            setMsg(els.msg, e.message, true);
        }
        render();
    }

    // Back from Stripe Checkout: confirm straight away (the webhook does the same in the background)
    async function handleReturn() {
        const params = new URLSearchParams(window.location.search);
        const result = params.get('membership');
        if (!result) return;
        const sessionId = params.get('session_id') || '';
        params.delete('membership'); params.delete('session_id');
        const clean = window.location.pathname + (params.toString() ? `?${params}` : '') + window.location.hash;
        window.history.replaceState(null, '', clean);
        if (result === 'cancelled') { setMsg(els.msg, 'Payment cancelled. Nothing was charged.'); return; }
        if (result !== 'success' || !sessionId) return;
        setMsg(els.msg, 'Confirming your membership…');
        try {
            status = await api('/api/membership/confirm', { method: 'POST', body: JSON.stringify({ sessionId }) });
            setMsg(els.msg, status.isMember ? 'Welcome! Your membership is active.' : 'Payment received. Your membership will be active in a moment.');
            render();
        } catch (e) {
            setMsg(els.msg, e.message, true);
        }
    }

    async function withBusy(btn, fn) {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        try { await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
    }

    els.join.addEventListener('click', () => withBusy(els.join, async () => {
        setMsg(els.msg, '');
        try {
            if (!currentUser()) {
                if (!window.firebaseService || !window.firebaseService.signInWithGoogle) throw new Error('Sign-in is loading. Please try again in a moment.');
                await window.firebaseService.signInWithGoogle();
                await loadStatus();
                if (status && status.isMember) return;
            }
            const { url } = await api('/api/membership/checkout', { method: 'POST', body: JSON.stringify({ returnPath: window.location.pathname }) });
            if (!/^https:\/\/checkout\.stripe\.com\//.test(url)) throw new Error('Could not open the payment page.');
            window.location.assign(url);
        } catch (e) {
            if (e && e.code === 'auth/popup-closed-by-user') return;
            setMsg(els.msg, e.message, true);
        }
    }));

    els.manage.addEventListener('click', () => withBusy(els.manage, async () => {
        try {
            const { url } = await api('/api/membership/portal', { method: 'POST', body: '{}' });
            if (!/^https:\/\/billing\.stripe\.com\//.test(url)) throw new Error('Could not open membership management.');
            window.location.assign(url);
        } catch (e) { setMsg(els.msg, e.message, true); }
    }));

    // ---- Members chat ----
    function renderTopics() {
        els.topics.replaceChildren(...((status && status.topics) || []).map(t => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'members-chat-topic';
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(t.id === currentTopic));
            b.dataset.agentId = `members-chat-topic-${t.id}`;
            b.dataset.testid = `members-chat-topic-${t.id}`;
            b.textContent = t.label;
            b.addEventListener('click', () => { currentTopic = t.id; renderTopics(); loadMessages(true); });
            return b;
        }));
    }

    function messageItem(m, term = '') {
        const li = document.createElement('li');
        li.className = `members-chat-item${m.mine ? ' is-mine' : ''}`;
        li.dataset.id = m.id;
        const meta = document.createElement('div');
        meta.className = 'members-chat-meta';
        const when = new Date(m.createdAt);
        meta.textContent = `${m.mine ? 'You' : m.authorName} · ${Number.isNaN(when.getTime()) ? '' : when.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`;
        const text = document.createElement('p');
        text.className = 'members-chat-text';
        renderMessageText(text, m.text, term); // pure DOM nodes + safe http/https anchors only
        li.append(meta, text);
        if (canModerate) li.append(deleteControls(m.id));
        return li;
    }

    // Two steps: Delete, then Confirm delete
    function deleteControls(id) {
        const wrap = document.createElement('div');
        wrap.className = 'members-chat-delete';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'members-chat-del-btn';
        del.textContent = 'Delete';
        del.setAttribute('aria-label', 'Delete this message');
        del.dataset.agentId = 'members-chat-delete';
        del.dataset.testid = 'members-chat-delete';
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'members-chat-del-btn is-danger';
        confirmBtn.textContent = 'Confirm delete';
        confirmBtn.hidden = true;
        confirmBtn.dataset.agentId = 'members-chat-confirm-delete';
        confirmBtn.dataset.testid = 'members-chat-confirm-delete';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'members-chat-del-btn';
        cancel.textContent = 'Cancel';
        cancel.hidden = true;
        del.addEventListener('click', () => { del.hidden = true; confirmBtn.hidden = false; cancel.hidden = false; cancel.focus(); });
        cancel.addEventListener('click', () => { del.hidden = false; confirmBtn.hidden = true; cancel.hidden = true; del.focus(); });
        confirmBtn.addEventListener('click', () => withBusy(confirmBtn, async () => {
            try {
                await api(`/api/members-chat/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ confirmDelete: true }) });
                messages = messages.filter(x => x.id !== id);
                renderLog(false);
            } catch (e) { setMsg(els.chatMsg, e.message, true); }
        }));
        wrap.append(del, cancel, confirmBtn);
        return wrap;
    }

    // Search + clickable links: builds pure DOM nodes (text nodes, <mark>, and safe http/https <a target="_blank" rel="noopener noreferrer">)
    let messages = [];
    const searchTerm = () => (els.search ? els.search.value.trim().toLowerCase() : '');

    function appendHighlighted(parent, text, term) {
        if (!text) return;
        if (!term) { parent.append(document.createTextNode(text)); return; }
        const lower = text.toLowerCase();
        let i = 0;
        let hit = lower.indexOf(term);
        while (hit !== -1) {
            if (hit > i) parent.append(document.createTextNode(text.slice(i, hit)));
            const mark = document.createElement('mark');
            mark.textContent = text.slice(hit, hit + term.length);
            parent.append(mark);
            i = hit + term.length;
            hit = lower.indexOf(term, i);
        }
        if (i < text.length) parent.append(document.createTextNode(text.slice(i)));
    }

    function splitTrailingPunctuation(token) {
        let urlPart = token;
        let tail = '';
        while (urlPart.length) {
            if (/[.,!?;:]$/.test(urlPart)) {
                tail = urlPart.slice(-1) + tail;
                urlPart = urlPart.slice(0, -1);
                continue;
            }
            if (urlPart.endsWith(')') && (urlPart.match(/\)/g) || []).length > (urlPart.match(/\(/g) || []).length) {
                tail = ')' + tail;
                urlPart = urlPart.slice(0, -1);
                continue;
            }
            break;
        }
        return [urlPart, tail];
    }

    function renderMessageText(el, text, term) {
        el.replaceChildren();
        const urlPattern = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
        let cursor = 0;
        let match;
        while ((match = urlPattern.exec(text)) !== null) {
            if (match.index > cursor) appendHighlighted(el, text.slice(cursor, match.index), term);
            const [rawUrl, tail] = splitTrailingPunctuation(match[0]);
            const candidate = /^www\./i.test(rawUrl) ? `https://${rawUrl}` : rawUrl;
            let parsed = null;
            try {
                const u = new URL(candidate);
                if (u.protocol === 'http:' || u.protocol === 'https:') parsed = u;
            } catch (_) {
                parsed = null;
            }
            if (parsed && rawUrl) {
                const link = document.createElement('a');
                link.className = 'members-chat-link';
                link.href = parsed.href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                appendHighlighted(link, rawUrl, term);
                el.append(link);
                if (tail) appendHighlighted(el, tail, term);
            } else {
                appendHighlighted(el, match[0], term);
            }
            cursor = match.index + match[0].length;
        }
        if (cursor < text.length) appendHighlighted(el, text.slice(cursor), term);
    }

    function renderLog(scrollToEnd) {
        const term = searchTerm();
        const shown = term
            ? messages.filter(m => m.text.toLowerCase().includes(term) || String(m.authorName).toLowerCase().includes(term))
            : messages;
        const nearEnd = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 60;
        els.log.replaceChildren(...shown.map(m => messageItem(m, term)));
        if (!shown.length) {
            const empty = document.createElement('li');
            empty.className = 'members-chat-empty';
            empty.textContent = term ? 'No messages match your search.' : 'No messages yet. Start the conversation!';
            els.log.append(empty);
        }
        if (els.searchCount) els.searchCount.textContent = term ? `${shown.length} of ${messages.length}` : '';
        if (!term && (scrollToEnd || nearEnd)) els.log.scrollTop = els.log.scrollHeight;
    }

    async function loadMessages(scrollToEnd) {
        try {
            const data = await api(`/api/members-chat?topic=${encodeURIComponent(currentTopic)}`);
            canModerate = Boolean(data.canModerate);
            messages = Array.isArray(data.messages) ? data.messages : [];
            renderLog(scrollToEnd);
        } catch (e) { setMsg(els.chatMsg, e.message, true); }
    }

    if (els.search) {
        els.search.addEventListener('input', () => renderLog(false));
        els.search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && els.search.value) { e.preventDefault(); e.stopPropagation(); els.search.value = ''; renderLog(true); } });
    }

    els.chat.addEventListener('click', () => {
        setMsg(els.chatMsg, '');
        renderTopics();
        els.dialog.showModal();
        loadMessages(true);
        clearInterval(pollTimer);
        pollTimer = setInterval(() => { if (els.dialog.open && !document.hidden) loadMessages(false); }, 10000);
    });
    els.dialog.addEventListener('close', () => { clearInterval(pollTimer); pollTimer = null; });

    els.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = els.input.value.trim();
        if (!text) return;
        withBusy(els.send, async () => {
            try {
                await api('/api/members-chat', { method: 'POST', body: JSON.stringify({ topic: currentTopic, text }) });
                els.input.value = '';
                setMsg(els.chatMsg, '');
                await loadMessages(true);
            } catch (err) { setMsg(els.chatMsg, err.message, true); }
        });
    });
    els.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); els.form.requestSubmit(); }
    });

    let returnHandled = false;
    window.addEventListener('firebaseAuthChanged', async () => {
        await loadStatus();
        if (!returnHandled && currentUser()) { returnHandled = true; await handleReturn(); }
    });
    render();
})();
