// ============ UTILITIES ============
function formatNum(n) {
  if (n == null || isNaN(n)) return '0';
  return n.toLocaleString('de-DE');
}
function percent(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}
function formatDate(ts, short = false) {
  if (!ts) return '–';
  const d = new Date(ts);
  if (isNaN(d)) return '–';
  if (short) {
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays < 1) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (diffDays < 7) return d.toLocaleDateString('de-DE', { weekday: 'short' });
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatDay(ymd) {
  if (!ymd) return '–';
  const [y, m, d] = ymd.split('-');
  return new Date(+y, +m-1, +d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatMinutes(mins) {
  if (mins < 1) return `${Math.round(mins*60)}s`;
  if (mins < 60) return `${Math.round(mins)} min`;
  if (mins < 60*24) return `${(mins/60).toFixed(1)} h`;
  return `${(mins/60/24).toFixed(1)} Tage`;
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function avatarInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function avatarGradient(name, type) {
  // Hash name to hue
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  const hue = h % 360;
  // Etwas gedämpfte Sättigung/Helligkeit für den hellen Apple-Hintergrund
  if (type === 'group') return `linear-gradient(135deg, hsl(${hue}, 62%, 56%), hsl(${(hue+40)%360}, 68%, 48%))`;
  return `linear-gradient(135deg, hsl(${hue}, 66%, 56%), hsl(${(hue+30)%360}, 70%, 46%))`;
}
function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a,b) => a-b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
}
function authorName(authorId, chat) {
  if (authorId === STATE.selfId) return 'Du';
  const r = STATE.recipients.get(authorId);
  if (r) return r.name;
  if (chat && chat.type === 'contact') return chat.name;
  // Unmapped ACI (e.g. ex-group-member with no contact record): show a stable, readable label
  if (typeof authorId === 'string' && /^[A-Za-z0-9+/=]{20,}$/.test(authorId)) {
    return `Unbekanntes Mitglied (${authorId.slice(0, 6)}…)`;
  }
  return 'Unbekannt';
}

// ============ WORD CLOUD ============
function renderWordCloud(wordCounts, maxWords = 60) {
  const entries = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxWords);
  if (!entries.length) return '<div style="color:var(--text-muted);padding:1rem 0">Keine Daten</div>';

  const max = entries[0][1];
  const min = entries[entries.length - 1][1];
  const range = max - min || 1;

  // Apple/Signal-blaue Palette – auf hellem wie dunklem Hintergrund gut lesbar
  const colors = [
    '#007aff', '#0a84ff', '#5e5ce6', '#5856d6',
    '#34c0eb', '#bf5af2', '#0071e3', '#ff375f',
  ];

  const tags = entries.map(([word, count]) => {
    const t = (count - min) / range; // 0..1
    const size = 0.75 + t * 2.1;    // 0.75rem..2.85rem
    const opacity = 0.55 + t * 0.45;
    const color = colors[Math.floor(t * (colors.length - 1))];
    return `<span class="word-cloud-tag" title="${escapeHtml(word)}: ${formatNum(count)}"
      style="font-size:${size.toFixed(2)}rem;color:${color};opacity:${opacity.toFixed(2)}"
    >${escapeHtml(word)}</span>`;
  });

  // Shuffle so it doesn't look like a sorted list
  for (let i = tags.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tags[i], tags[j]] = [tags[j], tags[i]];
  }

  return `<div class="word-cloud">${tags.join('')}</div>`;
}

// ============ EXPORT ============
function exportStats() {
  const toObj = (map) => Object.fromEntries(map);
  // Map authorIds in a counter Map → readable names
  const namedMap = (map) => {
    const out = {};
    for (const [id, c] of map) {
      const r = STATE.recipients.get(id);
      const key = id === STATE.selfId ? 'You' : (r ? r.name : `id:${id}`);
      out[key] = c;
    }
    return out;
  };

  const exportData = {
    exportedAt: new Date().toISOString(),
    account: STATE.account,
    excludedChats: STATE.excludedChats,
    total: {
      messages: STATE.totalStats.total,
      sent: STATE.totalStats.sent,
      received: STATE.totalStats.received,
      contacts: STATE.totalStats.contactCount,
      groups: STATE.totalStats.groupCount,
      activeDays: STATE.totalStats.activeDays,
      durationDays: STATE.totalStats.durationDays,
      avgPerDay: +STATE.totalStats.avgPerDay.toFixed(2),
      pureTextCount: STATE.totalStats.pureTextCount || 0,
      editedCount: STATE.totalStats.editedCount,
      deletedCount: STATE.totalStats.deletedCount,
      viewOnceCount: STATE.totalStats.viewOnceCount,
      pollCount: STATE.totalStats.pollCount,
      quoteCount: STATE.totalStats.quoteCount,
      linkCount: STATE.totalStats.linkCount,
      allCapsCount: STATE.totalStats.allCapsCount,
      exclamationMsgCount: STATE.totalStats.exclamationMsgCount,
      mediaCounts: STATE.totalStats.mediaCounts,
      mediaCountsSent: STATE.totalStats.mediaCountsSent,
      attachmentTotal: STATE.totalStats.attachmentTotal,
      calls: {
        total: STATE.totalStats.callCount,
        accepted: STATE.totalStats.callAcceptedCount,
        missed: STATE.totalStats.callMissedCount,
        outgoing: STATE.totalStats.callOutgoingCount,
        incoming: STATE.totalStats.callIncomingCount,
      },
      reactionsGiven: STATE.totalStats.reactionsGiven,
      reactionsReceived: STATE.totalStats.reactionsReceived,
      delivery: {
        medianMs: STATE.totalStats.deliveryMedianMs,
        samples: STATE.totalStats.deliverySamples,
      },
      read: {
        medianMs: STATE.totalStats.readMedianMs,
        samples: STATE.totalStats.readSamples,
      },
      topWords: [...STATE.totalStats.wordCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,50).map(([w,c])=>({word:w,count:c})),
      topBigrams: [...STATE.totalStats.bigramCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([b,c])=>({bigram:b,count:c})),
      topEmojis: [...STATE.totalStats.emojiCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([e,c])=>({emoji:e,count:c})),
      topReactions: [...STATE.totalStats.reactionEmojiCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([e,c])=>({emoji:e,count:c})),
      topDomains: [...STATE.totalStats.domainCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([d,c])=>({domain:d,count:c})),
      formatCounts: toObj(STATE.totalStats.formatCounts),
      mentionCounts: namedMap(STATE.totalStats.mentionCounts),
      quotedAuthorCounts: namedMap(STATE.totalStats.quotedAuthorCounts),
      quoterCounts: namedMap(STATE.totalStats.quoterCounts),
      systemTypeCounts: toObj(STATE.totalStats.systemTypeCounts),
      byMonth: toObj(STATE.totalStats.byMonth),
      byHour: STATE.totalStats.byHour,
      byWeekday: STATE.totalStats.byWeekday,
      busiestDay: STATE.totalStats.busiestDay,
      busiestDayCount: STATE.totalStats.busiestDayCount,
      longestStreak: STATE.totalStats.longestStreak,
      longestSilenceDays: STATE.totalStats.longestSilenceDays,
    },
    chats: [...STATE.chats.values()].filter(c => c.messages.length > 0).map(c => {
      const perPerson = {};
      for (const [authorId, pp] of c.stats.perPerson) {
        const r = STATE.recipients.get(authorId);
        const name = authorId === STATE.selfId ? 'You' : (r ? r.name : `id:${authorId}`);
        perPerson[name] = {
          sent: pp.sent,
          totalChars: pp.totalChars,
          avgChars: pp.charsCount ? +(pp.totalChars / pp.charsCount).toFixed(1) : 0,
          questionCount: pp.questionCount,
          exclamationCount: pp.exclamationCount,
          allCapsCount: pp.allCapsCount,
          reactionsGiven: pp.reactionsGiven,
          reactionsReceived: pp.reactionsReceived,
          callCount: pp.callCount || 0,
          quotesGiven: pp.quotesGiven,
          quotedCount: pp.quotedCount,
          mentionsGiven: pp.mentionsGiven,
          mentionsReceived: pp.mentionsReceived,
          mediaCounts: pp.mediaCounts,
          formatCounts: toObj(pp.formatCounts),
          topWords: [...pp.wordCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([w,c])=>({word:w,count:c})),
          topEmojis: [...pp.emojiCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([e,c])=>({emoji:e,count:c})),
        };
      }
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        muted: c.muted,
        expireTimerMs: c.expireTimerMs,
        groupMeta: c.groupMeta,
        messages: c.messages.length,
        sent: c.stats.sent,
        received: c.stats.received,
        activeDays: c.stats.activeDays,
        first: c.stats.first,
        last: c.stats.last,
        mediaCounts: c.stats.mediaCounts,
        editedCount: c.stats.editedCount,
        deletedCount: c.stats.deletedCount,
        quoteCount: c.stats.quoteCount,
        linkCount: c.stats.linkCount,
        calls: {
          total: c.stats.callCount,
          accepted: c.stats.callAcceptedCount,
          missed: c.stats.callMissedCount,
          outgoing: c.stats.callOutgoingCount,
          incoming: c.stats.callIncomingCount,
        },
        delivery: { medianMs: c.stats.deliveryMedianMs, samples: c.stats.deliverySamples },
        read: { medianMs: c.stats.readMedianMs, samples: c.stats.readSamples },
        responseTimeMeMedian: c.stats.responseTimesMe?.length ? +median(c.stats.responseTimesMe).toFixed(1) : null,
        responseTimeOtherMedian: c.stats.responseTimesOther?.length ? +median(c.stats.responseTimesOther).toFixed(1) : null,
        initiationsByAuthor: c.stats.initiationsByAuthor ? namedMap(c.stats.initiationsByAuthor) : {},
        topWords: [...c.stats.wordCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([w,c])=>({word:w,count:c})),
        topDomains: [...c.stats.domainCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([d,c])=>({domain:d,count:c})),
        quotedAuthorCounts: namedMap(c.stats.quotedAuthorCounts),
        quoterCounts: namedMap(c.stats.quoterCounts),
        perPerson,
      };
    }),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `signal-stats-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('✓ Stats exportiert');
}

// ============ MOBILE DRAWER ============
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebar-backdrop');
const menuBtn = document.getElementById('mobile-menu-btn');

function openDrawer() {
  sidebar.classList.add('open');
  backdrop.classList.add('show');
  menuBtn.textContent = '✕';
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('show');
  menuBtn.textContent = '☰';
  document.body.style.overflow = '';
}
function isMobile() { return window.innerWidth <= 768; }

menuBtn.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeDrawer() : openDrawer();
});
backdrop.addEventListener('click', closeDrawer);

// Close drawer when a chat is selected on mobile
document.getElementById('chat-list').addEventListener('click', () => {
  if (isMobile()) closeDrawer();
});
document.getElementById('nav-dashboard').addEventListener('click', () => {
  if (isMobile()) closeDrawer();
}, true);

// Inject mobile topbar into content on render
function injectMobileTopbar(title) {
  if (!isMobile()) return;
  const content = document.getElementById('content');
  const existing = content.querySelector('.mobile-topbar');
  if (existing) existing.remove();
  const bar = document.createElement('div');
  bar.className = 'mobile-topbar';
  bar.innerHTML = `
    <span class="mobile-topbar-title">◢ ${title}</span>
    <button class="mobile-topbar-btn" id="topbar-menu-btn">☰ Chats</button>
  `;
  content.insertBefore(bar, content.firstChild);
  bar.querySelector('#topbar-menu-btn').addEventListener('click', openDrawer);
}
