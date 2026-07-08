
function computeTotalStats() {
  const s = freshStatsShape();
  s.chatTypeCount = { contact: 0, group: 0, other: 0 };
  s.messagesPerChat = [];
  s.stickerPackCounts = new Map();
  s.contactCount = 0;
  s.groupCount = 0;

  // Archived + releaseNotes chats are already excluded in parseBackup,
  // so STATE.chats and STATE.messages only contain real, active conversations.
  for (const chat of STATE.chats.values()) {
    if (!chat.messages.length) continue;
    if (chat.type === 'contact') s.chatTypeCount.contact++;
    else if (chat.type === 'group') s.chatTypeCount.group++;
    else s.chatTypeCount.other++;
    s.messagesPerChat.push({ id: chat.id, name: chat.name, type: chat.type, count: chat.messages.length, color: chat.color });
  }
  s.contactCount = s.chatTypeCount.contact;
  s.groupCount = s.chatTypeCount.group;
  s.messagesPerChat.sort((a, b) => b.count - a.count);

  for (const m of STATE.messages) accumulateMessage(s, m);
  finalizeStats(s);

  // Sticker pack aggregation for total
  for (const m of STATE.messages) {
    if (m.kind === 'sticker' && m.stickerPackId) {
      s.stickerPackCounts.set(m.stickerPackId, (s.stickerPackCounts.get(m.stickerPackId) || 0) + 1);
    }
  }

  return s;
}

function computeChatStats(chat) {
  const s = freshStatsShape();
  s.participantCounts = new Map(); // authorId -> count (groups)
  s.responseTimes = [];            // minutes
  s.initiationsByAuthor = new Map(); // authorId -> count (3h+ silence → new convo)

  let lastIncomingTs = null;
  let lastOutgoingTs = null;
  let lastActiveTs = null;
  const CONVO_GAP_MS = 3 * 60 * 60 * 1000;  // 3 hours

  s.responseTimesMe = [];    // other → me
  s.responseTimesOther = []; // me → other
  for (const m of chat.messages) {
    accumulateMessage(s, m);
    if (chat.type === 'group' && !m.isSystem && m.kind !== 'call') {
      s.participantCounts.set(m.authorId, (s.participantCounts.get(m.authorId) || 0) + 1);
    }
    // Conversation initiations: who breaks the silence after ≥3h (non-system)
    if (!m.isSystem && m.kind !== 'call') {
      if (lastActiveTs == null || (m.timestamp - lastActiveTs) >= CONVO_GAP_MS) {
        s.initiationsByAuthor.set(m.authorId, (s.initiationsByAuthor.get(m.authorId) || 0) + 1);
      }
      lastActiveTs = m.timestamp;
    }
    // response time: bidirectional (1:1 chats only)
    if (chat.type === 'contact' && !m.isSystem) {
      if (m.incoming) {
        if (lastOutgoingTs) {
          const diffMin = (m.timestamp - lastOutgoingTs) / 60000;
          if (diffMin > 0 && diffMin < 60 * 24 * 7) s.responseTimesOther.push(diffMin);
          lastOutgoingTs = null;
        }
        lastIncomingTs = m.timestamp;
      } else if (m.outgoing) {
        if (lastIncomingTs) {
          const diffMin = (m.timestamp - lastIncomingTs) / 60000;
          if (diffMin > 0 && diffMin < 60 * 24 * 7) s.responseTimesMe.push(diffMin);
          lastIncomingTs = null;
        }
        lastOutgoingTs = m.timestamp;
      }
    }
  }
  // Keep combined for backwards compat
  s.responseTimes = [...s.responseTimesMe, ...s.responseTimesOther];
  finalizeStats(s);

  // who writes first each day
  s.firstPerDay = { me: 0, other: 0 };
  const perDayFirst = new Map();
  for (const m of chat.messages) {
    if (m.isSystem) continue;
    // Use local date (matches byDate/heatmap) — NOT toISOString() which is UTC
    const d = new Date(m.timestamp);
    const day = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (!perDayFirst.has(day)) perDayFirst.set(day, m);
  }
  for (const m of perDayFirst.values()) {
    if (m.outgoing) s.firstPerDay.me++;
    else s.firstPerDay.other++;
  }

  return s;
}

function freshStatsShape() {
  return {
    total: 0, sent: 0, received: 0,
    textCount: 0, systemCount: 0, deletedCount: 0, viewOnceCount: 0, pollCount: 0,
    editedCount: 0,                   // messages that were edited (have revisions)
    allCapsCount: 0,                  // shouty messages (≥80% uppercase)
    exclamationMsgCount: 0,           // messages containing "!"
    callCount: 0,                     // total calls (accepted + missed)
    callMissedCount: 0,
    callAcceptedCount: 0,
    callOutgoingCount: 0,
    callIncomingCount: 0,
    mediaCounts: { image: 0, gif: 0, video: 0, audio: 0, voice: 0, file: 0, sticker: 0 },
    mediaCountsSent: { image: 0, gif: 0, video: 0, audio: 0, voice: 0, file: 0, sticker: 0 },
    attachmentTotal: 0,               // total attachment objects (multi-attachment aware)
    quoteCount: 0, linkCount: 0,
    reactionsGiven: 0, reactionsReceived: 0,
    emojiCounts: new Map(),           // emoji -> count (in text)
    reactionEmojiCounts: new Map(),   // emoji -> count (reactions)
    wordCounts: new Map(),
    bigramCounts: new Map(),          // "word1 word2" -> count
    domainCounts: new Map(),          // host -> count (from links)
    formatCounts: new Map(),          // BOLD/ITALIC/... -> count
    mentionCounts: new Map(),         // mentioned ACI -> count (we match ACI back to recipient)
    quotedAuthorCounts: new Map(),    // authorId of quoted person -> count (who gets quoted)
    quoterCounts: new Map(),          // authorId doing the quoting -> count
    systemTypeCounts: new Map(),      // systemType -> count
    deliveryMsList: [],               // ms deltas sent→delivered
    readMsList: [],                   // ms deltas sent→read
    byHour: new Array(24).fill(0),
    byWeekday: new Array(7).fill(0),
    byMonth: new Map(),               // 'YYYY-MM' -> count
    byDate: new Map(),                // 'YYYY-MM-DD' -> count (local time)
    heatmap: Array.from({length: 7}, () => new Array(24).fill(0)), // weekday -> hour
    first: null, last: null,
    longest: null, // {text, timestamp, authorId}
    totalChars: 0, charsCount: 0,
    avgLen: 0,
    perPerson: new Map(), // authorId -> per-person stats object
  };
}

// Fresh per-person shape (kept in sync with accumulateMessage)
function _freshPerPerson() {
  return {
    sent: 0,
    emojiCounts: new Map(),
    wordCounts: new Map(),
    mediaCounts: { image: 0, gif: 0, video: 0, audio: 0, voice: 0, file: 0, sticker: 0 },
    reactionsGiven: 0,
    reactionsReceived: 0,
    totalChars: 0,
    charsCount: 0,
    questionCount: 0,
    exclamationCount: 0,
    allCapsCount: 0,
    callCount: 0,
    quotesGiven: 0,          // how many quotes THIS person authored
    quotedCount: 0,          // how many times THIS person got quoted
    mentionsGiven: 0,        // how many mentions THIS person sent
    mentionsReceived: 0,     // how many times THIS person got mentioned
    formatCounts: new Map(), // styles used by this person
    byHour: new Array(24).fill(0),
  };
}

function accumulateMessage(s, m) {
  s.total++;
  if (m.outgoing) s.sent++;
  else if (m.incoming) s.received++;

  // Calls get counted as their own category but still skip text/media processing
  if (m.kind === 'call') {
    s.callCount++;
    if (m.callMissed) s.callMissedCount++;
    if (m.callAccepted) s.callAcceptedCount++;
    if (m.callDirection === 'OUTGOING') s.callOutgoingCount++;
    else if (m.callDirection === 'INCOMING') s.callIncomingCount++;
    if (m.authorId != null) {
      if (!s.perPerson.has(m.authorId)) s.perPerson.set(m.authorId, _freshPerPerson());
      s.perPerson.get(m.authorId).callCount++;
    }
    _accumulateTimeBuckets(s, m);
    return;
  }

  if (m.isSystem) {
    s.systemCount++;
    if (m.systemType) {
      s.systemTypeCounts.set(m.systemType, (s.systemTypeCounts.get(m.systemType) || 0) + 1);
    }
    return;
  }

  if (m.kind === 'standard') {
    s.textCount++;
    if (!m.hasAttachment && !m.mediaType) s.pureTextCount = (s.pureTextCount || 0) + 1;
  }
  if (m.isEdited) s.editedCount++;
  if (m.isDeleted) s.deletedCount++;
  if (m.isViewOnce) s.viewOnceCount++;
  if (m.isPoll) s.pollCount++;
  if (m.quote) s.quoteCount++;
  if (m.linkPreview) s.linkCount++;
  if (m.isAllCaps) s.allCapsCount++;
  if (m.text && m.text.includes('!')) s.exclamationMsgCount++;

  // Quote analysis — who got quoted, who did the quoting
  if (m.quote && m.quoteAuthorId != null) {
    s.quotedAuthorCounts.set(m.quoteAuthorId, (s.quotedAuthorCounts.get(m.quoteAuthorId) || 0) + 1);
    if (m.authorId != null) {
      s.quoterCounts.set(m.authorId, (s.quoterCounts.get(m.authorId) || 0) + 1);
    }
  }

  // Delivery / Read timing (outgoing only)
  if (m.deliveryMs != null) s.deliveryMsList.push(m.deliveryMs);
  if (m.readMs != null) s.readMsList.push(m.readMs);

  // Text-range formatting
  if (m.textFormats?.length) {
    for (const f of m.textFormats) {
      s.formatCounts.set(f, (s.formatCounts.get(f) || 0) + 1);
    }
  }
  // Mentions: count how often each person gets @-mentioned
  if (m.mentionAuthors?.length) {
    for (const aci of m.mentionAuthors) {
      // Try to map ACI back to recipient id (match via .data.contact.aci or .data.self.aci)
      let mentionedId = aci;
      for (const [rid, r] of STATE.recipients) {
        if (r.data?.contact?.aci === aci || r.data?.self?.aci === aci) { mentionedId = rid; break; }
      }
      s.mentionCounts.set(mentionedId, (s.mentionCounts.get(mentionedId) || 0) + 1);
    }
  }

  // URL domains
  if (m.urlDomains?.length) {
    for (const d of m.urlDomains) {
      s.domainCounts.set(d, (s.domainCounts.get(d) || 0) + 1);
    }
  }

  // Media: count ALL attachments (not just the first one)
  if (m.mediaTypes?.length) {
    s.attachmentTotal += m.mediaTypes.length;
    for (const t of m.mediaTypes) {
      s.mediaCounts[t] = (s.mediaCounts[t] || 0) + 1;
      if (m.outgoing) s.mediaCountsSent[t] = (s.mediaCountsSent[t] || 0) + 1;
    }
  } else if (m.mediaType) {
    s.mediaCounts[m.mediaType] = (s.mediaCounts[m.mediaType] || 0) + 1;
    if (m.outgoing) s.mediaCountsSent[m.mediaType] = (s.mediaCountsSent[m.mediaType] || 0) + 1;
  }

  if (m.reactions?.length) {
    for (const r of m.reactions) {
      if (r.authorId === STATE.selfId) {
        s.reactionsGiven++;
      } else if (m.outgoing) {
        s.reactionsReceived++;
      }
      if (r.emoji) {
        s.reactionEmojiCounts.set(r.emoji, (s.reactionEmojiCounts.get(r.emoji) || 0) + 1);
      }
    }
  }

  if (m.text) {
    s.totalChars += m.text.length;
    s.charsCount++;
    if (!s.longest || m.text.length > (s.longest.text?.length || 0)) {
      s.longest = { text: m.text, timestamp: m.timestamp, authorId: m.authorId, outgoing: m.outgoing };
    }
    for (const e of (m.emojis || [])) {
      s.emojiCounts.set(e, (s.emojiCounts.get(e) || 0) + 1);
    }
    const words = m.words || [];
    for (const w of words) {
      s.wordCounts.set(w, (s.wordCounts.get(w) || 0) + 1);
    }
    // Bigrams (consecutive word pairs) — skip when fewer than 2 meaningful words
    for (let i = 0; i < words.length - 1; i++) {
      const bg = words[i] + ' ' + words[i+1];
      s.bigramCounts.set(bg, (s.bigramCounts.get(bg) || 0) + 1);
    }
  }

  // Per-person tracking
  if (m.authorId != null) {
    if (!s.perPerson.has(m.authorId)) s.perPerson.set(m.authorId, _freshPerPerson());
    const pp = s.perPerson.get(m.authorId);
    pp.sent++;

    // Per-person hour distribution
    const dd = new Date(m.timestamp);
    if (!isNaN(dd)) pp.byHour[dd.getHours()]++;

    // Per-person media
    if (m.mediaTypes?.length) {
      for (const t of m.mediaTypes) pp.mediaCounts[t] = (pp.mediaCounts[t] || 0) + 1;
    } else if (m.mediaType) {
      pp.mediaCounts[m.mediaType] = (pp.mediaCounts[m.mediaType] || 0) + 1;
    }
    if (m.text) {
      pp.totalChars += m.text.length;
      pp.charsCount++;
      if (m.text.includes('?')) pp.questionCount++;
      if (m.text.includes('!')) pp.exclamationCount++;
      if (m.isAllCaps) pp.allCapsCount++;
      for (const e of (m.emojis || [])) pp.emojiCounts.set(e, (pp.emojiCounts.get(e) || 0) + 1);
      for (const w of (m.words || [])) pp.wordCounts.set(w, (pp.wordCounts.get(w) || 0) + 1);
    }
    // Per-person formatting
    if (m.textFormats?.length) {
      for (const f of m.textFormats) {
        pp.formatCounts.set(f, (pp.formatCounts.get(f) || 0) + 1);
      }
    }
    // Per-person quoting stats
    if (m.quote) {
      pp.quotesGiven++;
      if (m.quoteAuthorId != null) {
        if (!s.perPerson.has(m.quoteAuthorId)) s.perPerson.set(m.quoteAuthorId, _freshPerPerson());
        s.perPerson.get(m.quoteAuthorId).quotedCount++;
      }
    }
    // Per-person mentions
    if (m.mentionAuthors?.length) {
      pp.mentionsGiven += m.mentionAuthors.length;
      for (const aci of m.mentionAuthors) {
        let mentionedId = aci;
        for (const [rid, r] of STATE.recipients) {
          if (r.data?.contact?.aci === aci || r.data?.self?.aci === aci) { mentionedId = rid; break; }
        }
        if (!s.perPerson.has(mentionedId)) s.perPerson.set(mentionedId, _freshPerPerson());
        s.perPerson.get(mentionedId).mentionsReceived++;
      }
    }

    if (m.reactions?.length) {
      for (const r of m.reactions) {
        if (r.authorId != null) {
          if (!s.perPerson.has(r.authorId)) s.perPerson.set(r.authorId, _freshPerPerson());
          s.perPerson.get(r.authorId).reactionsGiven++;
          pp.reactionsReceived++;
        }
      }
    }
  }

  _accumulateTimeBuckets(s, m);
}

// Helper so both standard messages and calls share the same time-bucket logic
function _accumulateTimeBuckets(s, m) {
  const d = new Date(m.timestamp);
  if (!isNaN(d)) {
    s.byHour[d.getHours()]++;
    s.byWeekday[(d.getDay() + 6) % 7]++; // Monday = 0
    s.heatmap[(d.getDay() + 6) % 7][d.getHours()]++;
    const ym = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    s.byMonth.set(ym, (s.byMonth.get(ym) || 0) + 1);
    const ymd = ym + '-' + String(d.getDate()).padStart(2,'0');
    s.byDate.set(ymd, (s.byDate.get(ymd) || 0) + 1);
    if (!s.first || m.timestamp < s.first) s.first = m.timestamp;
    if (!s.last || m.timestamp > s.last) s.last = m.timestamp;
  }
}

function finalizeStats(s) {
  s.avgLen = s.charsCount ? s.totalChars / s.charsCount : 0;
  if (s.first && s.last) {
    s.durationDays = Math.max(1, Math.round((s.last - s.first) / 86400000));
    s.avgPerDay = s.total / s.durationDays;
  } else {
    s.durationDays = 0;
    s.avgPerDay = 0;
  }
  // Busiest day
  let maxDay = null, maxDayCount = 0;
  for (const [d, c] of s.byDate) {
    if (c > maxDayCount) { maxDayCount = c; maxDay = d; }
  }
  s.busiestDay = maxDay; s.busiestDayCount = maxDayCount;

  // Longest silence gap between consecutive days with activity
  const sortedDates = [...s.byDate.keys()].sort();
  let maxGap = 0, gapStart = null, gapEnd = null;
  for (let i = 1; i < sortedDates.length; i++) {
    const a = new Date(sortedDates[i-1]);
    const b = new Date(sortedDates[i]);
    const gap = Math.round((b - a) / 86400000);
    if (gap > maxGap) { maxGap = gap; gapStart = sortedDates[i-1]; gapEnd = sortedDates[i]; }
  }
  s.longestSilenceDays = maxGap;
  s.silenceRange = (gapStart && gapEnd) ? [gapStart, gapEnd] : null;

  // Longest active streak
  let streak = 0, maxStreak = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) { streak = 1; }
    else {
      const a = new Date(sortedDates[i-1]);
      const b = new Date(sortedDates[i]);
      const gap = Math.round((b - a) / 86400000);
      if (gap === 1) streak++;
      else streak = 1;
    }
    if (streak > maxStreak) maxStreak = streak;
  }
  s.longestStreak = maxStreak;
  s.activeDays = sortedDates.length;

  // Delivery/read timing aggregates
  s.deliveryMedianMs = s.deliveryMsList.length ? median(s.deliveryMsList) : null;
  s.deliverySamples = s.deliveryMsList.length;
  s.readMedianMs = s.readMsList.length ? median(s.readMsList) : null;
  s.readSamples = s.readMsList.length;
}

// Unicode emoji regex (covers pictographs + flags + keycaps; good enough for stats)
const EMOJI_REGEX = /(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*(?:\uFE0F)?|[\u{1F1E6}-\u{1F1FF}]{2}|[0-9*#]\uFE0F?\u20E3)/gu;
function extractEmojis(text) {
  const matches = text.match(EMOJI_REGEX);
  return matches || [];
}

function extractWords(text) {
  // Strip emojis, URLs, mentions
  const cleaned = text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(EMOJI_REGEX, ' ')
    .replace(/[.,!?;:()\[\]{}"„"'`´<>\/\\|*#+=~^%$&@_\-]/g, ' ')
    .toLowerCase();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const out = [];
  for (const t of tokens) {
    if (t.length < 3 || t.length > 20) continue;
    if (/^\d+$/.test(t)) continue;
    if (STOPWORDS.has(t)) continue;
    out.push(t);
  }
  return out;
}

// ============ SIDEBAR / CHAT LIST ============
let currentSort = 'activity';
