
function buildChatList(filter = '') {
  const listEl = document.getElementById('chat-list');
  const chats = [...STATE.chats.values()].filter(c => {
    if (c.messages.length === 0) return false;
    if (c.type === 'releaseNotes') return false;
    if (filter && !c.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  if (currentSort === 'activity') chats.sort((a,b) => b.messages.length - a.messages.length);
  else if (currentSort === 'recent') chats.sort((a,b) => (b.stats.last || 0) - (a.stats.last || 0));
  else if (currentSort === 'name') chats.sort((a,b) => a.name.localeCompare(b.name, 'de'));

  listEl.innerHTML = '';
  for (const chat of chats) {
    const li = document.createElement('li');
    li.className = 'chat-item' + (STATE.activeChatId === chat.id ? ' active' : '');
    li.dataset.chatId = chat.id;
    li.innerHTML = `
      <div class="chat-avatar ${chat.type === 'group' ? 'group' : ''}" style="background:${avatarGradient(chat.name, chat.type)}">
        ${avatarInitials(chat.name)}
      </div>
      <div class="chat-meta">
        <div class="chat-name">${escapeHtml(chat.name)}</div>
        <div class="chat-preview">${chat.type === 'group' ? '👥 Gruppe' : '💬 Chat'} · ${formatDate(chat.stats.last, true)}</div>
      </div>
      <span class="chat-badge">${formatNum(chat.messages.length)}</span>
    `;
    li.addEventListener('click', () => selectChat(chat.id));
    listEl.appendChild(li);
  }
}

document.getElementById('chat-search').addEventListener('input', e => buildChatList(e.target.value));
document.querySelectorAll('.sort-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSort = tab.dataset.sort;
    buildChatList(document.getElementById('chat-search').value);
  });
});
document.getElementById('nav-dashboard').addEventListener('click', () => {
  STATE.activeChatId = null;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-dashboard').classList.add('active');
  document.getElementById('content').classList.remove('messenger-mode');
  renderDashboard();
});

function selectChat(chatId) {
  STATE.activeChatId = chatId;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.chatId === chatId));
  document.getElementById('nav-dashboard').classList.remove('active');
  renderChat(chatId);
}

// ============ RENDER: DASHBOARD ============
function renderDashboard() {
  const content = document.getElementById('content');
  const s = STATE.totalStats;
  const activeChats = s.messagesPerChat.length;
  const totalStickerPacks = STATE.stickerPacks.size;

  const senderName = STATE.account?.givenName || 'Ich';

  content.innerHTML = `
    <div class="content-header fade-in">
      <div>
        <h1 class="content-title">Gesamt-Dashboard</h1>
        <div class="content-subtitle">// ${senderName} · ${formatDate(s.first)} → ${formatDate(s.last)}</div>
      </div>
      <div class="header-badge">${activeChats} aktive Chats · ${formatNum(s.total)} Nachrichten</div>
      <button onclick="exportStats()" style="padding:0.4rem 0.9rem;font-family:var(--font-mono);font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--cyan);background:var(--glass);border:1px solid var(--border);border-radius:4px;cursor:pointer;transition:all 0.2s" onmouseover="this.style.background='var(--glass-hover)'" onmouseout="this.style.background='var(--glass)'">⬇ Stats exportieren</button>
    </div>

    ${STATE.excludedChats.archived > 0 ? `
      <div style="margin:0 0 1.5rem 0;padding:0.7rem 1rem;background:var(--glass);border:1px solid var(--border);border-radius:6px;font-family:var(--font-mono);font-size:0.75rem;color:var(--text-dim);letter-spacing:0.04em">
        📦 ${STATE.excludedChats.archived} archivierte${STATE.excludedChats.archived === 1 ? 'r Chat wird' : ' Chats werden'} ignoriert und nicht ausgewertet.
      </div>
    ` : ''}

    ${renderOverviewCards(s, { totalChats: activeChats, contacts: s.contactCount, groups: s.groupCount, stickerPacks: totalStickerPacks })}

    <div class="section">
      <h2 class="section-title">Verteilung</h2>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Gesendet vs Empfangen</div>
          ${renderRatioBar(s.sent, s.received, 'Gesendet', 'Empfangen')}
        </div>
        <div class="panel">
          <div class="panel-title">Chat-Typen</div>
          <div class="chart-box short"><canvas id="chart-chat-types"></canvas></div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Medien & Inhalte</h2>
      ${renderMediaBreakdown(s)}
    </div>

    <div class="section">
      <h2 class="section-title">Aktivität über Zeit</h2>
      <div class="panel">
        <div class="panel-title">Nachrichten pro Monat</div>
        <div class="chart-box tall"><canvas id="chart-monthly"></canvas></div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Wann schreibst du?</h2>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Stündlich</div>
          <div class="chart-box"><canvas id="chart-hourly"></canvas></div>
        </div>
        <div class="panel">
          <div class="panel-title">Wochentage</div>
          <div class="chart-box"><canvas id="chart-weekday"></canvas></div>
        </div>
      </div>
      <div class="panel" style="margin-top:1.25rem">
        <div class="panel-title">Heatmap · Wochentag × Stunde</div>
        ${renderHeatmap(s.heatmap)}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Rankings</h2>
      <div class="grid-3">
        <div class="panel">
          <div class="panel-title">Top 10 Chats</div>
          ${renderLeaderboard(s.messagesPerChat.slice(0, 10).map(c => ({label: c.name, value: c.count})))}
        </div>
        <div class="panel">
          <div class="panel-title">Top Emojis im Text</div>
          ${renderEmojiLeaderboard(s.emojiCounts, 10)}
        </div>
        <div class="panel">
          <div class="panel-title">Top Reaktionen</div>
          ${renderEmojiLeaderboard(s.reactionEmojiCounts, 10)}
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Wörter & Sticker</h2>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Word Cloud</div>
          ${renderWordCloud(s.wordCounts, 60)}
        </div>
        <div class="panel">
          <div class="panel-title">Top 20 Wörter</div>
          ${renderLeaderboard([...s.wordCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,20).map(([w,c]) => ({label: w, value: c})))}
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Sticker</h2>
      <div class="panel">
        <div class="panel-title">Top Sticker-Packs</div>
        ${renderStickerPackLeaderboard(s.stickerPackCounts, 10)}
      </div>
    </div>

    ${renderLanguageSection(s)}
    ${renderDomainsSection(s)}
    ${renderQuoteSection(s)}
    ${renderDeliverySection(s)}

    <div class="section">
      <h2 class="section-title">Records</h2>
      <div class="grid-3">
        ${renderRecordCard('🏆 Aktivster Tag', s.busiestDay ? formatDay(s.busiestDay) : '–', s.busiestDayCount ? `${formatNum(s.busiestDayCount)} Nachrichten` : '')}
        ${renderRecordCard('🔥 Längster Streak', s.longestStreak ? `${s.longestStreak} Tage` : '–', `${s.activeDays} aktive Tage gesamt`)}
        ${renderRecordCard('🌙 Längste Pause', s.longestSilenceDays ? `${s.longestSilenceDays} Tage` : '–', s.silenceRange ? `${formatDay(s.silenceRange[0])} → ${formatDay(s.silenceRange[1])}` : '')}
      </div>
      ${s.longest ? `
        <div class="panel" style="margin-top:1.25rem">
          <div class="panel-title">Längste Nachricht · ${s.longest.text.length.toLocaleString('de-DE')} Zeichen</div>
          <div class="msg-bubble">${escapeHtml(s.longest.text).replace(/\n/g, '<br>')}</div>
          <div class="msg-bubble-meta">${s.longest.outgoing ? 'Du' : (STATE.recipients.get(s.longest.authorId)?.name || 'Unbekannt')} · ${formatDateTime(s.longest.timestamp)}</div>
        </div>
      ` : ''}
    </div>
  `;

  // Render charts after DOM
  requestAnimationFrame(() => {
    renderChatTypesChart(s);
    renderMonthlyChart(s, 'chart-monthly');
    renderHourlyChart(s, 'chart-hourly');
    renderWeekdayChart(s, 'chart-weekday');
    injectMobileTopbar('Dashboard');
  });
}

// ============ RENDER: SINGLE CHAT ============
const CHAT_VIEW_STATE = { tab: 'stats', msgOffset: 0, msgSearch: '', chatId: null };
const PAGE_SIZE = 200;

function renderChat(chatId) {
  if (chatId !== CHAT_VIEW_STATE.chatId) {
    CHAT_VIEW_STATE.tab = 'stats';
    CHAT_VIEW_STATE.msgOffset = 0;
    CHAT_VIEW_STATE.msgSearch = '';
    CHAT_VIEW_STATE.chatId = chatId;
  }
  const content = document.getElementById('content');
  const chat = STATE.chats.get(chatId);
  if (!chat) return;
  const s = chat.stats;
  const typeLabel = chat.type === 'group' ? 'Gruppe' : chat.type === 'contact' ? '1:1 Chat' : chat.type;

  content.innerHTML = `
    <div class="content-header fade-in" style="padding-bottom:1rem">
      <div style="display:flex;align-items:center;gap:1rem">
        <div class="chat-avatar ${chat.type === 'group' ? 'group' : ''}"
             style="width:56px;height:56px;font-size:1.1rem;background:${avatarGradient(chat.name, chat.type)}">
          ${avatarInitials(chat.name)}
        </div>
        <div>
          <h1 class="content-title">${escapeHtml(chat.name)}</h1>
          <div class="content-subtitle">// ${typeLabel} · ${formatDate(s.first)} → ${formatDate(s.last)} · ${s.durationDays} Tage</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div class="header-badge">${formatNum(s.total)} Nachrichten</div>
        <div class="view-tabs">
          <button class="view-tab ${CHAT_VIEW_STATE.tab === 'stats' ? 'active' : ''}" id="tab-stats">📊 Statistiken</button>
          <button class="view-tab ${CHAT_VIEW_STATE.tab === 'msgs' ? 'active' : ''}" id="tab-msgs">💬 Nachrichten</button>
        </div>
      </div>
    </div>
    <div id="chat-tab-content"></div>
  `;

  document.getElementById('tab-stats').addEventListener('click', () => {
    CHAT_VIEW_STATE.tab = 'stats';
    document.getElementById('content').classList.remove('messenger-mode');
    renderChatTabContent(chatId);
    document.getElementById('tab-stats').classList.add('active');
    document.getElementById('tab-msgs').classList.remove('active');
  });
  document.getElementById('tab-msgs').addEventListener('click', () => {
    CHAT_VIEW_STATE.tab = 'msgs';
    CHAT_VIEW_STATE.msgOffset = 0;
    CHAT_VIEW_STATE.msgSearch = '';
    document.getElementById('content').classList.add('messenger-mode');
    renderChatTabContent(chatId);
    document.getElementById('tab-msgs').classList.add('active');
    document.getElementById('tab-stats').classList.remove('active');
  });

  renderChatTabContent(chatId);
}

function renderChatTabContent(chatId) {
  const chat = STATE.chats.get(chatId);
  const container = document.getElementById('chat-tab-content');
  const contentEl = document.getElementById('content');
  if (!container) return;

  if (CHAT_VIEW_STATE.tab === 'stats') {
    contentEl.classList.remove('messenger-mode');
    renderChatStats(chat, container);
  } else {
    contentEl.classList.add('messenger-mode');
    renderMessengerView(chat, container);
  }
}

function renderPerPerson(s, chat) {
  const pp = s.perPerson;
  if (!pp || pp.size < 2) return '';

  // Sort participants by sent count.
  // Filter out "phantom" entries that exist only because someone was mentioned/quoted/reacted-to
  // but never actually wrote anything in this chat (e.g. ex-members whose ACI we can't resolve).
  // The schreibstil comparison only makes sense for people who actually wrote messages.
  const people = [...pp.entries()]
    .filter(([id, p]) => id != null && p.sent > 0)
    .sort((a, b) => b[1].sent - a[1].sent);

  if (people.length < 2) return '';

  // ---- Emoji breakdown ----
  const emojiPanels = people.map(([id, p]) => {
    const name = authorName(id, chat);
    const initials = avatarInitials(name);
    const grad = avatarGradient(name);
    const topEmojis = [...p.emojiCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8);
    const emojiHtml = topEmojis.length
      ? `<ul class="leaderboard emoji" style="margin-top:0.5rem">${topEmojis.map(([e, c], i) => `
          <li>
            <span class="lb-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">#${i+1}</span>
            <span class="lb-label">${e}</span>
            <span class="lb-value">${formatNum(c)}</span>
          </li>`).join('')}</ul>`
      : `<div style="color:var(--text-muted);font-size:0.85rem;margin-top:0.5rem">Keine Emojis</div>`;
    return `
      <div class="panel">
        <div class="panel-title">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${grad};font-family:var(--font-display);font-size:0.6rem;font-weight:700;color:#fff;flex-shrink:0;margin-right:0.4rem">${initials}</span>
          ${escapeHtml(name)}
        </div>
        ${emojiHtml}
      </div>`;
  }).join('');

  // ---- Schreibstil comparison ----
  const styleCards = people.map(([id, p]) => {
    const name = authorName(id, chat);
    const grad = avatarGradient(name);
    const initials = avatarInitials(name);
    const avgLen = p.charsCount ? Math.round(p.totalChars / p.charsCount) : 0;
    const totalMedia = Object.values(p.mediaCounts).reduce((a,b) => a+b, 0);
    const mediaPercent = p.sent ? Math.round((totalMedia / p.sent) * 100) : 0;
    const questionPercent = p.charsCount ? Math.round((p.questionCount / p.charsCount) * 100) : 0;
    return `
      <div class="panel" style="display:flex;flex-direction:column;gap:0.75rem">
        <div class="panel-title">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${grad};font-family:var(--font-display);font-size:0.6rem;font-weight:700;color:#fff;flex-shrink:0;margin-right:0.4rem">${initials}</span>
          ${escapeHtml(name)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem">
          <div style="background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:0.7rem 0.75rem">
            <div class="stat-label">Ø Länge</div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:1.3rem;color:var(--pink-1)">${avgLen}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Zeichen</div>
          </div>
          <div style="background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:0.7rem 0.75rem">
            <div class="stat-label">Nachrichten</div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:1.3rem;color:var(--text)">${formatNum(p.sent)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">${formatNum(p.totalChars)} Zeichen</div>
          </div>
          <div style="background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:0.7rem 0.75rem">
            <div class="stat-label" style="color:var(--cyan)">Medien</div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:1.3rem;color:var(--cyan)">${mediaPercent}%</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">${formatNum(totalMedia)} Dateien</div>
          </div>
          <div style="background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:0.7rem 0.75rem">
            <div class="stat-label" style="color:var(--purple)">Fragen</div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:1.3rem;color:var(--purple)">${questionPercent}%</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">${formatNum(p.questionCount)} Nachr.</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // ---- Reaktionen ----
  const totalReactionsGiven = people.reduce((a,[,p]) => a + p.reactionsGiven, 0);
  const totalReactionsReceived = people.reduce((a,[,p]) => a + p.reactionsReceived, 0);

  const reactionRows = people.map(([id, p]) => {
    const name = authorName(id, chat);
    const grad = avatarGradient(name);
    const initials = avatarInitials(name);
    const givenPct = totalReactionsGiven ? Math.round((p.reactionsGiven / totalReactionsGiven) * 100) : 0;
    const recvPct = totalReactionsReceived ? Math.round((p.reactionsReceived / totalReactionsReceived) * 100) : 0;
    return `
      <div style="display:flex;flex-direction:column;gap:0.45rem;padding:0.6rem 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.25rem">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${grad};font-family:var(--font-display);font-size:0.65rem;font-weight:700;color:#fff;flex-shrink:0">${initials}</span>
          <span style="font-weight:600;font-size:0.95rem">${escapeHtml(name)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.6rem;font-size:0.82rem">
          <span style="width:90px;color:var(--text-muted);font-family:var(--font-mono);font-size:0.7rem;letter-spacing:0.05em">Gegeben</span>
          <div style="flex:1;height:6px;background:var(--track);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${givenPct}%;background:var(--blue);border-radius:3px;box-shadow:0 0 6px var(--pink-glow)"></div>
          </div>
          <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--pink-1);min-width:52px;text-align:right">${formatNum(p.reactionsGiven)} <span style="color:var(--text-muted)">(${givenPct}%)</span></span>
        </div>
        <div style="display:flex;align-items:center;gap:0.6rem;font-size:0.82rem">
          <span style="width:90px;color:var(--text-muted);font-family:var(--font-mono);font-size:0.7rem;letter-spacing:0.05em">Bekommen</span>
          <div style="flex:1;height:6px;background:var(--track);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${recvPct}%;background:var(--teal);border-radius:3px;box-shadow:0 0 6px var(--border)"></div>
          </div>
          <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--cyan);min-width:52px;text-align:right">${formatNum(p.reactionsReceived)} <span style="color:var(--text-muted)">(${recvPct}%)</span></span>
        </div>
      </div>`;
  }).join('');

  // How many columns for emoji panels
  const colClass = people.length <= 2 ? 'grid-2' : 'grid-3';

  return `
    <div class="section">
      <h2 class="section-title">Pro Person</h2>

      <div style="margin-bottom:1.25rem">
        <div class="panel-title" style="margin-bottom:0.75rem;padding-left:0.25rem">🎭 Schreibstil-Vergleich</div>
        <div class="${colClass}">${styleCards}</div>
      </div>

      <div style="margin-bottom:1.25rem">
        <div class="panel-title" style="margin-bottom:0.75rem;padding-left:0.25rem">😊 Emojis pro Person</div>
        <div class="${colClass}">${emojiPanels}</div>
      </div>

      <div class="panel">
        <div class="panel-title">💬 Reaktionen</div>
        ${totalReactionsGiven + totalReactionsReceived === 0
          ? `<div style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0">Keine Reaktionen in diesem Chat</div>`
          : reactionRows}
      </div>
    </div>
  `;
}

function renderChatStats(chat, container) {
  const s = chat.stats;
  destroyCharts();
  container.innerHTML = `
    ${renderGroupInfo(chat)}
    ${renderChatOverviewCards(s, chat)}

    <div class="section">
      <h2 class="section-title">Verteilung</h2>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">${chat.type === 'group' ? 'Teilnehmende' : 'Gesendet vs Empfangen'}</div>
          ${chat.type === 'group' ? renderParticipants(s.participantCounts) : renderRatioBar(s.sent, s.received, 'Du', chat.name)}
        </div>
        <div class="panel">
          <div class="panel-title">Medien-Mix</div>
          <div class="chart-box short"><canvas id="chart-media-mix"></canvas></div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Medien & Inhalte</h2>
      ${renderMediaBreakdown(s)}
    </div>

    <div class="section">
      <h2 class="section-title">Aktivität über Zeit</h2>
      <div class="panel">
        <div class="panel-title">Nachrichten pro Monat</div>
        <div class="chart-box tall"><canvas id="chart-c-monthly"></canvas></div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Wann wird geschrieben?</h2>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Stündlich</div>
          <div class="chart-box"><canvas id="chart-c-hourly"></canvas></div>
        </div>
        <div class="panel">
          <div class="panel-title">Wochentage</div>
          <div class="chart-box"><canvas id="chart-c-weekday"></canvas></div>
        </div>
      </div>
      <div class="panel" style="margin-top:1.25rem">
        <div class="panel-title">Heatmap · Wochentag × Stunde</div>
        ${renderHeatmap(s.heatmap)}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Top Listen</h2>
      <div class="grid-3">
        <div class="panel">
          <div class="panel-title">Top Emojis</div>
          ${renderEmojiLeaderboard(s.emojiCounts, 10)}
        </div>
        <div class="panel">
          <div class="panel-title">Top Reaktionen</div>
          ${renderEmojiLeaderboard(s.reactionEmojiCounts, 10)}
        </div>
        <div class="panel">
          <div class="panel-title">Top 15 Wörter</div>
          ${renderLeaderboard([...s.wordCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([w,c])=>({label:w, value:c})))}
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Word Cloud</h2>
      <div class="panel">
        <div class="panel-title">Häufigste Wörter</div>
        ${renderWordCloud(s.wordCounts, 50)}
      </div>
    </div>

    ${renderPerPerson(s, chat)}

    ${renderLanguageSection(s)}
    ${renderDomainsSection(s)}
    ${renderQuoteSection(s)}
    ${renderInitiationsSection(s, chat)}
    ${renderDeliverySection(s)}

    ${chat.type === 'contact' ? `
      <div class="section">
        <h2 class="section-title">Dynamik</h2>
        <div class="grid-3">
          ${renderRecordCard('⏱ Deine Ø Antwortzeit', s.responseTimesMe.length ? formatMinutes(median(s.responseTimesMe)) : '–', `${s.responseTimesMe.length} Antworten gemessen`)}
          ${renderRecordCard(`⏱ ${escapeHtml(chat.name)}'s Ø Antwortzeit`, s.responseTimesOther.length ? formatMinutes(median(s.responseTimesOther)) : '–', `${s.responseTimesOther.length} Antworten gemessen`)}
          ${renderRecordCard('☀ Wer startet den Tag?', (() => {
            const me = s.firstPerDay.me, o = s.firstPerDay.other;
            if (me + o === 0) return '–';
            return me > o ? 'Du' : me < o ? chat.name : 'Unentschieden';
          })(), `${s.firstPerDay.me} vs ${s.firstPerDay.other}`)}
        </div>
        <div class="grid-3" style="margin-top:1rem">
          ${renderRecordCard('📝 Ø Länge', s.avgLen ? `${Math.round(s.avgLen)} Zeichen` : '–', `${formatNum(s.charsCount)} Textnachrichten`)}
          ${renderRecordCard('🔥 Längster Streak', s.longestStreak ? `${s.longestStreak} Tage` : '–', `${s.activeDays} aktive Tage gesamt`)}
          ${renderRecordCard('🌙 Längste Pause', s.longestSilenceDays ? `${s.longestSilenceDays} Tage` : '–', s.silenceRange ? `${formatDay(s.silenceRange[0])} → ${formatDay(s.silenceRange[1])}` : '')}
        </div>
      </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Records</h2>
      <div class="grid-3">
        ${renderRecordCard('🏆 Aktivster Tag', s.busiestDay ? formatDay(s.busiestDay) : '–', s.busiestDayCount ? `${formatNum(s.busiestDayCount)} Nachrichten` : '')}
        ${renderRecordCard('🔥 Längster Streak', s.longestStreak ? `${s.longestStreak} Tage` : '–', `${s.activeDays} aktive Tage gesamt`)}
        ${renderRecordCard('🌙 Längste Pause', s.longestSilenceDays ? `${s.longestSilenceDays} Tage` : '–', s.silenceRange ? `${formatDay(s.silenceRange[0])} → ${formatDay(s.silenceRange[1])}` : '')}
      </div>
      ${s.longest ? `
        <div class="panel" style="margin-top:1.25rem">
          <div class="panel-title">Längste Nachricht · ${s.longest.text.length.toLocaleString('de-DE')} Zeichen</div>
          <div class="msg-bubble">${escapeHtml(s.longest.text).replace(/\n/g, '<br>')}</div>
          <div class="msg-bubble-meta">${s.longest.outgoing ? 'Du' : (STATE.recipients.get(s.longest.authorId)?.name || 'Unbekannt')} · ${formatDateTime(s.longest.timestamp)}</div>
        </div>
      ` : ''}
    </div>
  `;

  requestAnimationFrame(() => {
    renderMediaMixChart(s, 'chart-media-mix');
    renderMonthlyChart(s, 'chart-c-monthly');
    renderHourlyChart(s, 'chart-c-hourly');
    renderWeekdayChart(s, 'chart-c-weekday');
    injectMobileTopbar(chat.name);
  });
}

// ============ MESSENGER VIEW ============
function renderMessengerView(chat, container) {
  const search = CHAT_VIEW_STATE.msgSearch.toLowerCase().trim();
  const allMsgs = chat.messages.filter(m => !m.isSystem || m.kind === 'update');

  // Filter by search
  const filtered = search
    ? allMsgs.filter(m => m.text && m.text.toLowerCase().includes(search))
    : allMsgs;

  const total = filtered.length;
  const offset = CHAT_VIEW_STATE.msgOffset;
  // Show latest PAGE_SIZE from current window; load-more goes backward
  const windowEnd = total;
  const windowStart = Math.max(0, windowEnd - PAGE_SIZE - offset);
  const visible = filtered.slice(windowStart, windowEnd - offset || undefined);
  const hasMore = windowStart > 0;

  container.innerHTML = `
    <div class="messenger-wrap fade-in">
      <div class="messenger-search-bar">
        <input id="msg-search-input" type="search" placeholder="Nachrichten durchsuchen…" value="${escapeHtml(CHAT_VIEW_STATE.msgSearch)}">
        <span class="msg-count-badge">${search ? `${total} Treffer` : formatNum(total) + ' Nachrichten'}</span>
      </div>
      <div class="messenger-scroll" id="messenger-scroll">
        ${hasMore ? `<button class="load-more-btn" id="load-more-btn">↑ Ältere laden (${formatNum(windowStart)} weitere)</button>` : ''}
        ${renderMessageBubbles(visible, chat, search)}
      </div>
    </div>
  `;

  // Scroll to bottom on initial load (not on load-more)
  if (offset === 0) {
    requestAnimationFrame(() => {
      const scroll = document.getElementById('messenger-scroll');
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    });
  }

  // Search input
  document.getElementById('msg-search-input')?.addEventListener('input', e => {
    CHAT_VIEW_STATE.msgSearch = e.target.value;
    CHAT_VIEW_STATE.msgOffset = 0;
    renderMessengerView(chat, container);
  });

  // Load more
  document.getElementById('load-more-btn')?.addEventListener('click', () => {
    const scroll = document.getElementById('messenger-scroll');
    const prevHeight = scroll ? scroll.scrollHeight : 0;
    CHAT_VIEW_STATE.msgOffset += PAGE_SIZE;
    renderMessengerView(chat, container);
    // Keep scroll position after prepending
    requestAnimationFrame(() => {
      const s2 = document.getElementById('messenger-scroll');
      if (s2) s2.scrollTop = s2.scrollHeight - prevHeight;
    });
  });
}

function renderMessageBubbles(messages, chat, search = '') {
  if (!messages.length) {
    return search
      ? `<div class="empty-state"><div class="empty-state-icon">🔍</div>Keine Nachrichten gefunden für "${escapeHtml(search)}"</div>`
      : `<div class="empty-state"><div class="empty-state-icon">💬</div>Keine Nachrichten</div>`;
  }

  const isGroup = chat.type === 'group';
  const parts = [];
  let lastDay = null;
  let lastAuthorId = null;
  let lastDirection = null;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const next = messages[i + 1] || null;

    // Date divider — use LOCAL date, not UTC, so night-time messages land on the correct day
    const d = new Date(m.timestamp);
    const day = isNaN(d) ? null : (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'));
    if (day && day !== lastDay) {
      parts.push(`<div class="msg-date-divider">${formatDayDivider(d)}</div>`);
      lastDay = day;
      lastAuthorId = null;
    }

    // System messages: show the differentiated label we computed in parseChatItem
    if (m.isSystem) {
      parts.push(`<div class="msg-system">${m.systemLabel || '⚙ Systemnachricht'}</div>`);
      lastAuthorId = null;
      continue;
    }

    // Calls: render as centered system-style pill with context (direction + state)
    if (m.kind === 'call') {
      const timeStr = isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const dirArrow = m.callDirection === 'OUTGOING' ? '↗' : '↙';
      const stateClass = m.callMissed ? 'style="color:var(--pink-0)"' : '';
      parts.push(`<div class="msg-system" ${stateClass}>${m.systemLabel} ${dirArrow} · ${timeStr}</div>`);
      lastAuthorId = null;
      continue;
    }

    const dir = m.outgoing ? 'outgoing' : 'incoming';
    const sameAuthor = m.authorId === lastAuthorId && dir === lastDirection;
    const nextSameAuthor = next && next.authorId === m.authorId && (next.outgoing ? 'outgoing' : 'incoming') === dir && !next.isSystem && next.kind !== 'call';
    const isLastOfBlock = !nextSameAuthor;

    let classes = `msg-row ${dir}`;
    if (sameAuthor) classes += ' same-sender';
    if (isLastOfBlock) classes += ' last-of-block';

    // Sender name (show when first of block, always in groups for incoming)
    let senderHtml = '';
    if (!sameAuthor) {
      let name, color;
      if (m.outgoing) {
        name = STATE.account?.givenName || 'Du';
        color = 'var(--pink-1)';
      } else {
        const r = STATE.recipients.get(m.authorId);
        name = r ? r.name : (chat.type === 'contact' ? chat.name : 'Unbekannt');
        // Hash name to consistent color
        let h = 0;
        for (let ci = 0; ci < (name||'').length; ci++) h = (h * 31 + name.charCodeAt(ci)) & 0xffff;
        const hue = h % 360;
        color = `hsl(${hue}, 60%, 50%)`;
      }
      // Show name: always for groups, only for incoming in 1:1 if it would be ambiguous
      if (isGroup || (!m.outgoing && !sameAuthor)) {
        senderHtml = `<div class="msg-sender" style="color:${color}">${escapeHtml(name)}</div>`;
      }
    }

    // Bubble content
    let bubbleContent = '';
    let bubbleExtra = '';

    if (m.isDeleted) {
      bubbleContent = `<div class="msg-bubble-chat deleted">🗑 Nachricht gelöscht</div>`;
    } else if (m.isViewOnce) {
      bubbleContent = `<div class="msg-bubble-chat media-hint">🔥 Einmal-Ansicht</div>`;
    } else if (m.kind === 'sticker') {
      bubbleContent = `<div class="msg-bubble-chat media-hint">🌟 Sticker</div>`;
    } else if (m.kind === 'poll') {
      bubbleContent = `<div class="msg-bubble-chat">📊 Umfrage${m.text ? ': ' + highlightSearch(escapeHtml(m.text), search) : ''}</div>`;
    } else if (m.kind === 'contact') {
      bubbleContent = `<div class="msg-bubble-chat media-hint">👤 Kontakt geteilt</div>`;
    } else if (m.kind === 'payment') {
      bubbleContent = `<div class="msg-bubble-chat media-hint">💸 Zahlung</div>`;
    } else if (m.kind === 'gift') {
      bubbleContent = `<div class="msg-bubble-chat media-hint">🎁 Gift Badge</div>`;
    } else {
      // Standard message
      let inner = '';
      if (m.quote) {
        inner += `<div class="msg-quote">↩ Antwort auf Nachricht</div>`;
      }
      if (m.text) {
        inner += highlightSearch(escapeHtml(m.text), search);
      }
      if (m.hasAttachment && m.mediaType) {
        const mediaLabels = { image: '🖼 Bild', gif: '🎞 GIF', video: '🎬 Video', voice: '🎙 Sprachnachricht', audio: '🎵 Audio-Datei', file: '📎 Datei' };
        inner += (inner ? '\n' : '') + `<span style="opacity:0.7;font-style:italic;font-size:0.85em">${mediaLabels[m.mediaType] || '📎 Anhang'}</span>`;
      }
      if (!inner) inner = '<span style="opacity:0.45;font-style:italic;font-size:0.85em">–</span>';
      bubbleContent = `<div class="msg-bubble-chat">${inner}</div>`;
    }

    // Reactions
    if (m.reactions?.length) {
      const rxMap = new Map();
      for (const r of m.reactions) rxMap.set(r.emoji, (rxMap.get(r.emoji) || 0) + 1);
      const pills = [...rxMap.entries()].map(([e, c]) =>
        `<span class="msg-reaction-pill">${e}${c > 1 ? ' ' + c : ''}</span>`
      ).join('');
      bubbleExtra = `<div class="msg-reactions">${pills}</div>`;
    }

    // Timestamp
    const timeStr = isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const editedStr = m.isEdited ? ' · ✏ bearbeitet' : '';
    const timeHtml = `<div class="msg-time">${timeStr}${editedStr}</div>`;

    parts.push(`
      <div class="${classes}">
        ${senderHtml}
        ${bubbleContent}
        ${bubbleExtra}
        ${isLastOfBlock ? timeHtml : ''}
      </div>
    `);

    lastAuthorId = m.authorId;
    lastDirection = dir;
  }

  return parts.join('');
}

function highlightSearch(html, search) {
  if (!search) return html;
  // Escape regex special chars
  const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(${esc})`, 'gi'), '<mark class="msg-highlight">$1</mark>');
}

function formatDayDivider(date) {
  const now = new Date();
  const diffDays = Math.floor((now - date) / 86400000);
  const weekdays = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const months = ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return weekdays[date.getDay()];
  return `${weekdays[date.getDay()]}, ${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// ============ RENDER HELPERS ============
function renderOverviewCards(s, extra) {
  const hasCalls = s.callCount > 0;
  return `
    <div class="stat-grid">
      <div class="stat-card accent">
        <div class="stat-label">Nachrichten gesamt</div>
        <div class="stat-value pink">${formatNum(s.total)}</div>
        <div class="stat-sub">Ø ${s.avgPerDay.toFixed(1)} / Tag · ${s.durationDays} Tage</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Gesendet</div>
        <div class="stat-value">${formatNum(s.sent)}</div>
        <div class="stat-sub">${percent(s.sent, s.total)}% aller Nachrichten</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Empfangen</div>
        <div class="stat-value">${formatNum(s.received)}</div>
        <div class="stat-sub">${percent(s.received, s.total)}% aller Nachrichten</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">1:1 Chats</div>
        <div class="stat-value cyan">${formatNum(extra.contacts)}</div>
        <div class="stat-sub">${extra.groups} Gruppen · ${extra.stickerPacks} Sticker-Packs</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Reaktionen</div>
        <div class="stat-value">${formatNum(s.reactionsGiven + s.reactionsReceived)}</div>
        <div class="stat-sub">${formatNum(s.reactionsGiven)} gegeben · ${formatNum(s.reactionsReceived)} erhalten</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ø Nachrichtenlänge</div>
        <div class="stat-value">${Math.round(s.avgLen)}</div>
        <div class="stat-sub">${formatNum(s.totalChars)} Zeichen gesamt</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Aktive Tage</div>
        <div class="stat-value">${formatNum(s.activeDays)}</div>
        <div class="stat-sub">${percent(s.activeDays, s.durationDays)}% der Zeitspanne</div>
      </div>
      ${hasCalls ? `
      <div class="stat-card">
        <div class="stat-label">Anrufe</div>
        <div class="stat-value">${formatNum(s.callCount)}</div>
        <div class="stat-sub">${formatNum(s.callAcceptedCount)} angenommen · ${formatNum(s.callMissedCount)} verpasst</div>
      </div>
      ` : `
      <div class="stat-card">
        <div class="stat-label">Antworten / Zitate</div>
        <div class="stat-value">${formatNum(s.quoteCount)}</div>
        <div class="stat-sub">${formatNum(s.linkCount)} Links · ${formatNum(s.editedCount)} bearbeitet</div>
      </div>
      `}
    </div>
  `;
}

function renderChatOverviewCards(s, chat) {
  const ratio = s.sent + s.received ? (s.sent / (s.sent + s.received) * 100).toFixed(0) : 0;
  const hasCalls = s.callCount > 0;
  return `
    <div class="stat-grid">
      <div class="stat-card accent">
        <div class="stat-label">Nachrichten</div>
        <div class="stat-value pink">${formatNum(s.total)}</div>
        <div class="stat-sub">Ø ${s.avgPerDay.toFixed(1)} / Tag</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Gesendet</div>
        <div class="stat-value">${formatNum(s.sent)}</div>
        <div class="stat-sub">${ratio}% von dir</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Empfangen</div>
        <div class="stat-value">${formatNum(s.received)}</div>
        <div class="stat-sub">${100 - ratio}% von ${chat.type === 'group' ? 'anderen' : 'Gegenseite'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Zeichen</div>
        <div class="stat-value">${formatNum(s.totalChars)}</div>
        <div class="stat-sub">Ø ${Math.round(s.avgLen)} pro Nachricht</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Reaktionen</div>
        <div class="stat-value cyan">${formatNum(s.reactionsGiven + s.reactionsReceived)}</div>
        <div class="stat-sub">${formatNum(s.reactionsGiven)} gegeben</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Aktive Tage</div>
        <div class="stat-value">${formatNum(s.activeDays)}</div>
        <div class="stat-sub">${percent(s.activeDays, s.durationDays)}% der Zeit</div>
      </div>
      ${hasCalls ? `
      <div class="stat-card">
        <div class="stat-label">Anrufe</div>
        <div class="stat-value">${formatNum(s.callCount)}</div>
        <div class="stat-sub">${formatNum(s.callAcceptedCount)} angenommen · ${formatNum(s.callMissedCount)} verpasst</div>
      </div>
      ` : `
      <div class="stat-card">
        <div class="stat-label">Antworten / Zitate</div>
        <div class="stat-value">${formatNum(s.quoteCount)}</div>
        <div class="stat-sub">${formatNum(s.linkCount)} Links · ${formatNum(s.editedCount)} bearbeitet</div>
      </div>
      `}
      <div class="stat-card">
        <div class="stat-label">Gelöschte Nachrichten</div>
        <div class="stat-value">${formatNum(s.deletedCount)}</div>
        <div class="stat-sub">${formatNum(s.viewOnceCount)} View-Once · ${formatNum(s.pollCount)} Umfragen</div>
      </div>
    </div>
  `;
}

function renderMediaBreakdown(s) {
  const items = [
    { key: 'image',   label: 'Bilder',    emoji: '🖼️' },
    { key: 'gif',     label: 'GIFs',      emoji: '🎞️' },
    { key: 'video',   label: 'Videos',    emoji: '🎬' },
    { key: 'voice',   label: 'Sprachnachr.',  emoji: '🎙️' },
    { key: 'audio',   label: 'Audio-Datei',   emoji: '🎵' },
    { key: 'sticker', label: 'Sticker',   emoji: '🌟' },
    { key: 'file',    label: 'Dateien',   emoji: '📎' },
  ];
  return `
    <div class="media-grid">
      ${items.map(i => `
        <div class="media-card">
          <span class="media-emoji">${i.emoji}</span>
          <div class="media-count">${formatNum(s.mediaCounts[i.key] || 0)}</div>
          <div class="media-label">${i.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRatioBar(sent, received, labelA, labelB) {
  const total = sent + received;
  if (!total) return '<div style="color:var(--text-muted)">Keine Daten</div>';
  const pctA = (sent / total) * 100;
  const pctB = 100 - pctA;
  return `
    <div class="ratio-bar">
      <div class="ratio-segment" style="width:${pctA}%; background:linear-gradient(135deg, var(--blue), var(--indigo))">
        ${pctA > 8 ? `${pctA.toFixed(0)}%` : ''}
      </div>
      <div class="ratio-segment" style="width:${pctB}%; background:linear-gradient(135deg, var(--teal), var(--indigo))">
        ${pctB > 8 ? `${pctB.toFixed(0)}%` : ''}
      </div>
    </div>
    <div class="ratio-legend">
      <span>▌ ${escapeHtml(labelA)} · ${formatNum(sent)}</span>
      <span>${formatNum(received)} · ${escapeHtml(labelB)} ▐</span>
    </div>
  `;
}

function renderParticipants(counts) {
  const entries = [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 12);
  const total = entries.reduce((sum, [,c]) => sum + c, 0);
  return entries.map(([id, count]) => {
    const r = STATE.recipients.get(id);
    const name = r ? r.name : 'Unbekannt';
    const pct = (count / total) * 100;
    return `
      <div class="participant">
        <div class="participant-avatar" style="background:${avatarGradient(name)}">${avatarInitials(name)}</div>
        <div class="participant-name">${escapeHtml(name)}</div>
        <div class="lb-bar" style="max-width:120px"><div class="lb-bar-fill" style="width:${pct}%"></div></div>
        <div class="participant-count">${formatNum(count)}</div>
      </div>
    `;
  }).join('');
}

function renderLeaderboard(items) {
  if (!items.length) return '<div style="color:var(--text-muted);padding:1rem 0">Keine Daten</div>';
  const max = Math.max(...items.map(i => i.value));
  return `<ol class="leaderboard">${items.map((it, i) => `
    <li>
      <div class="lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${String(i+1).padStart(2,'0')}</div>
      <div class="lb-label">${escapeHtml(String(it.label))}</div>
      <div class="lb-bar"><div class="lb-bar-fill" style="width:${(it.value / max) * 100}%"></div></div>
      <div class="lb-value">${formatNum(it.value)}</div>
    </li>
  `).join('')}</ol>`;
}

function renderEmojiLeaderboard(counts, n) {
  const items = [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, n);
  if (!items.length) return '<div style="color:var(--text-muted);padding:1rem 0">Keine Daten</div>';
  const max = items[0][1];
  return `<ol class="leaderboard emoji">${items.map(([emoji, count], i) => `
    <li>
      <div class="lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${String(i+1).padStart(2,'0')}</div>
      <div class="lb-label">${emoji}</div>
      <div class="lb-bar"><div class="lb-bar-fill" style="width:${(count/max)*100}%"></div></div>
      <div class="lb-value">${formatNum(count)}</div>
    </li>
  `).join('')}</ol>`;
}

function renderStickerPackLeaderboard(counts, n) {
  const items = [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, n);
  if (!items.length) return '<div style="color:var(--text-muted);padding:1rem 0">Keine Sticker versendet</div>';
  const max = items[0][1];
  return `<ol class="leaderboard">${items.map(([packId, count], i) => {
    const pack = STATE.stickerPacks.get(packId);
    const title = pack?.title || `Pack ${packId?.slice(0,8) || '?'}...`;
    return `
      <li>
        <div class="lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${String(i+1).padStart(2,'0')}</div>
        <div class="lb-label">${escapeHtml(title)}</div>
        <div class="lb-bar"><div class="lb-bar-fill" style="width:${(count/max)*100}%"></div></div>
        <div class="lb-value">${formatNum(count)}</div>
      </li>
    `;
  }).join('')}</ol>`;
}

function renderRecordCard(label, value, sub) {
  return `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value pink" style="font-size:1.4rem">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>
  `;
}

// ============ NEW: Language patterns (questions, exclamations, caps, formats) ============
function renderLanguageSection(s) {
  const textWithQ = [...s.perPerson.values()].reduce((sum, pp) => sum + pp.questionCount, 0);
  const textWithExcl = s.exclamationMsgCount || 0;
  const capsTotal = s.allCapsCount || 0;
  const formatTotal = [...s.formatCounts.values()].reduce((a,b) => a+b, 0);
  const mentionTotal = [...s.mentionCounts.values()].reduce((a,b) => a+b, 0);
  const bigrams = [...s.bigramCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 15);

  // Format breakdown
  const formatItems = [...s.formatCounts.entries()].sort((a,b) => b[1]-a[1])
    .map(([f,c]) => `<span class="msg-reaction-pill">${f} · ${c}</span>`).join('');

  // Who gets mentioned
  const topMentions = [...s.mentionCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8).map(([id, c]) => {
    return { label: authorName(id, null), value: c };
  });

  return `
    <div class="section">
      <h2 class="section-title">Sprachmuster</h2>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Nachrichten mit „?"</div>
          <div class="stat-value">${formatNum(textWithQ)}</div>
          <div class="stat-sub">Fragen gesamt</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Nachrichten mit „!"</div>
          <div class="stat-value">${formatNum(textWithExcl)}</div>
          <div class="stat-sub">Ausrufe-Quote: ${percent(textWithExcl, s.textCount)}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">„SCHREIEND" (Caps)</div>
          <div class="stat-value">${formatNum(capsTotal)}</div>
          <div class="stat-sub">≥80% Großbuchstaben</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Formatierungen</div>
          <div class="stat-value cyan">${formatNum(formatTotal)}</div>
          <div class="stat-sub">${mentionTotal} @-Mentions</div>
        </div>
      </div>
      ${formatTotal > 0 ? `
        <div class="panel" style="margin-top:1.25rem">
          <div class="panel-title">Genutzte Textformatierungen</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem">${formatItems}</div>
        </div>
      ` : ''}
      <div class="grid-2" style="margin-top:1.25rem">
        <div class="panel">
          <div class="panel-title">Top Wortpaare (Bigramme)</div>
          ${renderLeaderboard(bigrams.map(([w,c]) => ({label: w, value: c})))}
        </div>
        <div class="panel">
          <div class="panel-title">Am meisten erwähnt</div>
          ${topMentions.length ? renderLeaderboard(topMentions) : '<div style="color:var(--text-muted);padding:1rem 0">Keine @-Mentions</div>'}
        </div>
      </div>
    </div>
  `;
}

// ============ NEW: URL domains ============
function renderDomainsSection(s) {
  const top = [...s.domainCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 15);
  if (!top.length) return '';
  return `
    <div class="section">
      <h2 class="section-title">Geteilte Links</h2>
      <div class="panel">
        <div class="panel-title">Top Domains · ${[...s.domainCounts.values()].reduce((a,b) => a+b, 0)} Links gesamt</div>
        ${renderLeaderboard(top.map(([d,c]) => ({label: d, value: c})))}
      </div>
    </div>
  `;
}

// ============ NEW: Quote analysis — who quotes whom ============
function renderQuoteSection(s) {
  if (!s.quoteCount) return '';
  const topQuoted = [...s.quotedAuthorCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10).map(([id,c]) => {
    return { label: authorName(id, null), value: c };
  });
  const topQuoter = [...s.quoterCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10).map(([id,c]) => {
    return { label: authorName(id, null), value: c };
  });
  return `
    <div class="section">
      <h2 class="section-title">Zitate · ${formatNum(s.quoteCount)} Antworten auf andere Nachrichten</h2>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Wer wird am meisten zitiert?</div>
          ${renderLeaderboard(topQuoted)}
        </div>
        <div class="panel">
          <div class="panel-title">Wer zitiert am meisten?</div>
          ${renderLeaderboard(topQuoter)}
        </div>
      </div>
    </div>
  `;
}

// ============ NEW: Delivery / Read timing ============
function renderDeliverySection(s) {
  if (!s.deliverySamples && !s.readSamples) return '';
  const fmt = (ms) => {
    if (ms == null) return '–';
    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(1)} s`;
    const min = sec / 60;
    if (min < 60) return `${min.toFixed(1)} min`;
    const h = min / 60;
    if (h < 24) return `${h.toFixed(1)} h`;
    return `${(h / 24).toFixed(1)} Tage`;
  };
  return `
    <div class="section">
      <h2 class="section-title">Zustell- & Lesezeiten</h2>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Zustellzeit (Median)</div>
          <div class="stat-value cyan">${fmt(s.deliveryMedianMs)}</div>
          <div class="stat-sub">aus ${formatNum(s.deliverySamples)} Empfangsbestätigungen</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Bis gelesen (Median)</div>
          <div class="stat-value pink">${fmt(s.readMedianMs)}</div>
          <div class="stat-sub">${s.readSamples > 0 ? `${formatNum(s.readSamples)} Lesebestätigungen` : 'Lesebestätigungen meist deaktiviert'}</div>
        </div>
      </div>
    </div>
  `;
}

// ============ NEW: Group info banner (member count, description, flags) ============
function renderGroupInfo(chat) {
  const flags = [];
  if (chat.muted) flags.push(`<span class="msg-reaction-pill">🔕 stummgeschaltet</span>`);
  if (chat.expireTimerMs) {
    const sec = chat.expireTimerMs / 1000;
    let label;
    if (sec < 60) label = `${sec}s`;
    else if (sec < 3600) label = `${Math.round(sec/60)}min`;
    else if (sec < 86400) label = `${Math.round(sec/3600)}h`;
    else label = `${Math.round(sec/86400)}d`;
    flags.push(`<span class="msg-reaction-pill">⏱ Verfallszeit: ${label}</span>`);
  }
  if (chat.groupMeta?.announcementOnly) flags.push(`<span class="msg-reaction-pill">📢 nur Ankündigungen</span>`);

  const hasGroupMeta = chat.type === 'group' && chat.groupMeta;
  if (!hasGroupMeta && !flags.length) return '';

  return `
    <div class="section" style="margin-top:0">
      <div class="panel" style="background:var(--glass);border-color:var(--border)">
        ${hasGroupMeta ? `
          <div style="display:flex;flex-wrap:wrap;gap:0.6rem 1.5rem;align-items:center;font-size:0.85rem;color:var(--text-dim)">
            <span><strong style="color:var(--pink-1)">${formatNum(chat.groupMeta.memberCount)}</strong> Mitglieder</span>
            ${chat.groupMeta.description ? `<span style="font-style:italic;opacity:0.8">„${escapeHtml(chat.groupMeta.description.slice(0, 200))}${chat.groupMeta.description.length > 200 ? '…' : ''}"</span>` : ''}
          </div>
        ` : ''}
        ${flags.length ? `<div style="margin-top:${hasGroupMeta ? '0.7rem' : '0'};display:flex;flex-wrap:wrap;gap:0.4rem">${flags.join('')}</div>` : ''}
      </div>
    </div>
  `;
}

// ============ NEW: Conversation initiations (3h-gap heuristic) ============
function renderInitiationsSection(s, chat) {
  if (!s.initiationsByAuthor || s.initiationsByAuthor.size === 0) return '';
  const total = [...s.initiationsByAuthor.values()].reduce((a,b) => a+b, 0);
  if (total < 2) return '';

  const items = [...s.initiationsByAuthor.entries()].sort((a,b) => b[1]-a[1]).map(([id, count]) => {
    return { label: authorName(id, chat), value: count };
  });

  return `
    <div class="section">
      <h2 class="section-title">Wer bricht das Schweigen?</h2>
      <div class="panel">
        <div class="panel-title">Gesprächs-Initiationen · ${formatNum(total)} Konversationen nach ≥3h Stille</div>
        ${renderLeaderboard(items)}
      </div>
    </div>
  `;
}

function renderHeatmap(heatmap) {
  const days = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  let max = 0;
  for (const row of heatmap) for (const v of row) if (v > max) max = v;
  if (max === 0) return '<div style="color:var(--text-muted)">Keine Daten</div>';

  let html = '<div class="heatmap-scroll-wrap">';
  html += '<div class="heatmap-hour-labels"><div></div>';
  for (let h = 0; h < 24; h++) html += `<div>${h % 6 === 0 ? h : ''}</div>`;
  html += '</div>';

  html += '<div class="heatmap">';
  for (let d = 0; d < 7; d++) {
    html += `<div class="heatmap-label">${days[d]}</div>`;
    for (let h = 0; h < 24; h++) {
      const v = heatmap[d][h];
      const intensity = v / max;
      const bg = v === 0
        ? 'var(--track)'
        : `rgba(0, 122, 255, ${0.12 + intensity * 0.82})`;
      html += `<div class="heatmap-cell" style="background:${bg}" title="${days[d]} ${h}:00 · ${v} Nachrichten"></div>`;
    }
  }
  html += '</div>';
  html += `<div class="heatmap-legend"><span>weniger</span><div class="heatmap-legend-grad"></div><span>mehr (max ${max})</span></div>`;
  html += '</div>'; // close heatmap-scroll-wrap
  return html;
}

// Chart.js defaults are configured theme-aware in charts.js (applyChartDefaults).

