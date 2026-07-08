
// ============ PARSER ============
function parseBackup(text) {
  // Reset state
  STATE.raw = null;
  STATE.account = null;
  STATE.selfId = null;
  STATE.recipients = new Map();
  STATE.chats = new Map();
  STATE.messages = [];
  STATE.stickerPacks = new Map();
  STATE.activeChatId = null;
  STATE.excludedChats = { archived: 0, releaseNotes: 0 };

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const raw = [];
  for (const line of lines) {
    try { raw.push(JSON.parse(line)); }
    catch (e) { /* ignore malformed line */ }
  }

  // If input was a single JSON (array), handle that
  if (raw.length === 1 && Array.isArray(raw[0])) {
    raw.splice(0, 1, ...raw[0]);
  }

  STATE.raw = raw;

  // 1st pass: account, recipients, sticker packs, chats
  for (const obj of raw) {
    if (obj.account) STATE.account = obj.account;
    if (obj.recipient) {
      const r = obj.recipient;
      let type = 'unknown', name = 'Unbekannt', color = null;
      let groupMeta = null;
      if (r.contact) {
        type = 'contact';
        const g = r.contact.profileGivenName || '';
        const f = r.contact.profileFamilyName || '';
        const sys = r.contact.systemGivenName || '';
        const sysF = r.contact.systemFamilyName || '';
        const nick = r.contact.nickname?.given || r.contact.nickname?.family || '';
        name = (nick || (sys + ' ' + sysF).trim() || (g + ' ' + f).trim() || r.contact.e164 || 'Unbekannt').trim();
        color = r.contact.avatarColor || null;
      } else if (r.group) {
        type = 'group';
        const snap = r.group.snapshot || {};
        name = snap.title?.title || 'Gruppe';
        color = snap.avatarColor || null;
        groupMeta = {
          memberCount: (snap.members || []).length,
          description: snap.description?.descriptionText || null,
          announcementOnly: !!snap.announcementOnly,
          disappearingMessagesDuration: snap.disappearingMessagesTimer?.disappearingMessagesDuration || null,
        };
      } else if (r.self) {
        type = 'self';
        name = STATE.account?.givenName || 'Ich';
        color = r.self.avatarColor || null;
        STATE.selfId = r.id;
      } else if (r.releaseNotes) {
        type = 'releaseNotes';
        name = 'Signal';
      } else if (r.distributionList) {
        type = 'distributionList';
        name = 'Story: ' + (r.distributionList.distributionList?.name || '');
      } else if (r.callLink) {
        type = 'callLink';
        name = 'Call Link: ' + (r.callLink.name || '');
      }
      STATE.recipients.set(r.id, { id: r.id, type, name, color, data: r, groupMeta });
    }
    if (obj.stickerPack) {
      STATE.stickerPacks.set(obj.stickerPack.packId || '', obj.stickerPack);
    }
  }

  // Ensure we found selfId even if recipient.self is missing
  if (!STATE.selfId) {
    for (const [id, r] of STATE.recipients) {
      if (r.type === 'self') { STATE.selfId = id; break; }
    }
  }

  // 2nd pass: chats — identify excluded chats (archived + releaseNotes)
  // Archived chats are fully dropped per user request; their messages never enter STATE
  const excludedChatIds = new Set();
  for (const obj of raw) {
    if (obj.chat) {
      const c = obj.chat;
      const r = STATE.recipients.get(c.recipientId);
      const isArchived = !!c.archived;
      const isReleaseNotes = r && r.type === 'releaseNotes';
      if (isArchived) {
        STATE.excludedChats.archived++;
        excludedChatIds.add(c.id);
        continue;
      }
      if (isReleaseNotes) {
        STATE.excludedChats.releaseNotes++;
        excludedChatIds.add(c.id);
        continue;
      }
      STATE.chats.set(c.id, {
        id: c.id,
        recipientId: c.recipientId,
        name: r ? r.name : 'Unbekannt',
        type: r ? r.type : 'unknown',
        color: r ? r.color : null,
        groupMeta: r ? r.groupMeta : null,
        muted: !!c.muteUntilMs && parseInt(c.muteUntilMs) > Date.now(),
        muteUntilMs: c.muteUntilMs ? parseInt(c.muteUntilMs) : null,
        expireTimerMs: c.expirationTimerMs ? parseInt(c.expirationTimerMs) : null,
        pinnedOrder: c.pinnedOrder ?? null,
        messages: [],
      });
    }
  }

  // 3rd pass: messages — skip excluded chats entirely
  for (const obj of raw) {
    if (!obj.chatItem) continue;
    const ci = obj.chatItem;
    if (excludedChatIds.has(ci.chatId)) continue;  // archived / releaseNotes: fully ignored
    const msg = parseChatItem(ci);
    if (!msg) continue;
    STATE.messages.push(msg);
    const chat = STATE.chats.get(msg.chatId);
    if (chat) chat.messages.push(msg);
  }

  // Release the raw buffer — it's big and we don't need it anymore
  STATE.raw = null;
}

function parseChatItem(ci) {
  const chatId = ci.chatId;
  const authorId = ci.authorId;
  const timestamp = parseInt(ci.dateSent || '0', 10);
  const outgoing = !!ci.outgoing;
  const incoming = !!ci.incoming;

  let kind = 'unknown';
  let text = '';
  let mediaType = null;         // primary media type (first attachment) — used for rendering
  let mediaTypes = [];          // ALL attachment types — used for stats counting
  let reactions = [];
  let quote = false;
  let quoteAuthorId = null;
  let quoteTargetTimestamp = null;
  let quoteText = null;
  let linkPreview = false;
  let linkPreviewUrls = [];     // actual URLs from linkPreview entries
  let hasAttachment = false;
  let attachmentCount = 0;
  let stickerPackId = null;
  let isDeleted = false;
  let isViewOnce = false;
  let isPoll = false;
  let isSystem = false;
  let isEdited = false;
  let systemLabel = null;       // human-readable label for system messages
  let systemType = null;        // machine-readable subtype (for stats)
  let textFormats = [];         // BOLD / ITALIC / STRIKETHROUGH / SPOILER / MONOSPACE
  let mentionAuthors = [];      // authorIds that were @-mentioned
  // Call fields (only set when kind === 'call')
  let callType = null;          // AUDIO_CALL / VIDEO_CALL
  let callDirection = null;     // INCOMING / OUTGOING
  let callMissed = false;
  let callAccepted = false;
  // Delivery/read timing (only outgoing)
  let deliveryMs = null;        // ms between sent and delivered (min across recipients)
  let readMs = null;            // ms between sent and read (min across recipients — fastest reader)

  if (ci.standardMessage) {
    kind = 'standard';
    const sm = ci.standardMessage;
    text = sm.text?.body || '';
    if (sm.reactions) reactions = sm.reactions;
    if (sm.quote) {
      quote = true;
      quoteAuthorId = sm.quote.authorId ?? null;
      quoteTargetTimestamp = sm.quote.targetSentTimestamp ? parseInt(sm.quote.targetSentTimestamp) : null;
      quoteText = sm.quote.text?.body || null;
    }
    if (sm.linkPreview?.length) {
      linkPreview = true;
      for (const lp of sm.linkPreview) {
        if (lp.url) linkPreviewUrls.push(lp.url);
      }
    }
    if (ci.revisions?.length) isEdited = true;   // has prior versions → was edited

    // Body-ranges: formatting + mentions
    if (sm.text?.bodyRanges?.length) {
      for (const br of sm.text.bodyRanges) {
        if (br.style) textFormats.push(br.style);
        if (br.mentionAci) mentionAuthors.push(br.mentionAci);
      }
    }

    if (sm.attachments?.length) {
      hasAttachment = true;
      attachmentCount = sm.attachments.length;
      // Count EACH attachment, not just the first
      for (const a of sm.attachments) {
        const ct = a.pointer?.contentType || '';
        // Signal stores the flag as 'flag' (singular) at the attachment level
        const flag = a.flag ?? a.flags ?? a.pointer?.flag ?? a.pointer?.flags ?? null;
        let t;
        if (flag === 'VOICE_MESSAGE' || flag === 1) t = 'voice';
        else if (flag === 'GIF' || flag === 4 || ct === 'image/gif') t = 'gif';
        else if (ct.startsWith('image/')) t = 'image';
        else if (ct.startsWith('video/')) t = 'video';
        else if (ct.startsWith('audio/')) t = 'audio';
        else t = 'file';
        mediaTypes.push(t);
      }
      mediaType = mediaTypes[0];  // primary for rendering
    }
  } else if (ci.stickerMessage) {
    kind = 'sticker';
    mediaType = 'sticker';
    mediaTypes = ['sticker'];
    stickerPackId = ci.stickerMessage.sticker?.packId || null;
    if (ci.stickerMessage.reactions) reactions = ci.stickerMessage.reactions;
  } else if (ci.updateMessage) {
    const um = ci.updateMessage;
    // Individual calls get their own kind (not 'system') so they can be counted separately
    if (um.individualCall) {
      kind = 'call';
      const call = um.individualCall;
      callType = call.type || 'AUDIO_CALL';
      callDirection = call.direction || null;
      callMissed = call.state === 'MISSED' || call.state === 'MISSED_NOTIFICATION_PROFILE';
      callAccepted = call.state === 'ACCEPTED';
      const callIcon = callType === 'VIDEO_CALL' ? '📹' : '📞';
      if (callMissed) {
        systemLabel = `${callIcon} Verpasster ${callType === 'VIDEO_CALL' ? 'Video-' : ''}Anruf`;
      } else if (callAccepted) {
        systemLabel = `${callIcon} ${callType === 'VIDEO_CALL' ? 'Video-' : ''}Anruf`;
      } else {
        systemLabel = `${callIcon} Anruf (${call.state || 'unbekannt'})`;
      }
      systemType = 'call';
    } else {
      kind = 'update';
      isSystem = true;
      if (um.simpleUpdate) {
        systemType = 'simple:' + (um.simpleUpdate.type || 'UNKNOWN');
        const typeLabels = {
          'IDENTITY_UPDATE': '🔐 Sicherheitsnummer geändert',
          'IDENTITY_VERIFIED': '✔️ Identität verifiziert',
          'IDENTITY_DEFAULT': '🔓 Verifizierung aufgehoben',
          'MESSAGE_REQUEST_ACCEPTED': '✅ Nachrichten-Anfrage akzeptiert',
          'CHANGE_NUMBER': '📱 Telefonnummer geändert',
          'JOINED_SIGNAL': '👋 Ist Signal beigetreten',
          'END_SESSION': '🔄 Sitzung zurückgesetzt',
          'CHAT_SESSION_REFRESH': '🔄 Chat aktualisiert',
          'BAD_DECRYPT': '⚠️ Entschlüsselungsfehler',
          'PAYMENTS_ACTIVATED': '💸 Zahlungen aktiviert',
          'PAYMENT_ACTIVATION_REQUEST': '💸 Zahlungen angefragt',
          'UNSUPPORTED_PROTOCOL_MESSAGE': '⚠️ Nicht unterstützte Nachricht',
          'REPORTED_SPAM': '🚫 Als Spam gemeldet',
          'BLOCKED': '🚫 Blockiert',
          'UNBLOCKED': '✅ Entsperrt',
          'RELEASE_CHANNEL_DONATION_REQUEST': '💝 Spendenaufruf',
        };
        systemLabel = typeLabels[um.simpleUpdate.type] || `⚙ ${um.simpleUpdate.type || 'Systemnachricht'}`;
      } else if (um.groupChange) {
        systemType = 'groupChange';
        systemLabel = '👥 Gruppen-Änderung';
      } else if (um.profileChange) {
        systemType = 'profileChange';
        const prev = um.profileChange.previousName || '';
        const cur = um.profileChange.newName || '';
        systemLabel = cur && prev ? `👤 Profilname: ${escapeHtml(prev)} → ${escapeHtml(cur)}` : '👤 Profil geändert';
      } else if (um.learnedProfileChange) {
        systemType = 'learnedProfileChange';
        systemLabel = '👤 Neues Profil bekannt';
      } else if (um.threadMerge) {
        systemType = 'threadMerge';
        systemLabel = '🔗 Chats zusammengeführt';
      } else if (um.sessionSwitchover) {
        systemType = 'sessionSwitchover';
        systemLabel = '🔄 Sitzung gewechselt';
      } else if (um.expirationTimerChange) {
        systemType = 'expirationTimerChange';
        systemLabel = '⏱ Verfallszeit geändert';
      } else {
        systemType = 'other';
        systemLabel = '⚙ Systemnachricht';
      }
    }
  } else if (ci.remoteDeletedMessage) {
    kind = 'deleted';
    isDeleted = true;
  } else if (ci.viewOnceMessage) {
    kind = 'viewOnce';
    isViewOnce = true;
  } else if (ci.poll) {
    kind = 'poll';
    isPoll = true;
    text = ci.poll.question || '';
  } else if (ci.contactMessage) {
    kind = 'contact';
  } else if (ci.paymentNotification) {
    kind = 'payment';
  } else if (ci.giftBadge) {
    kind = 'gift';
  }

  // Extract delivery/read timing from sendStatus (outgoing only)
  if (ci.outgoing?.sendStatus?.length) {
    let bestDelivered = null, bestRead = null;
    for (const ss of ci.outgoing.sendStatus) {
      const ts = parseInt(ss.timestamp || '0', 10);
      if (!ts || ts < timestamp) continue;
      const delta = ts - timestamp;
      if (delta < 0 || delta > 30 * 86400000) continue;  // sanity: within 30 days
      if (ss.read && (bestRead == null || delta < bestRead)) bestRead = delta;
      else if (ss.delivered && (bestDelivered == null || delta < bestDelivered)) bestDelivered = delta;
    }
    deliveryMs = bestDelivered;
    readMs = bestRead;
  }

  // Extract URL domains from linkPreview + text (for domain stats)
  const urlDomains = [];
  for (const u of linkPreviewUrls) {
    const d = extractDomain(u);
    if (d) urlDomains.push(d);
  }
  if (text) {
    const urls = text.match(/https?:\/\/[^\s<>"']+/g) || [];
    for (const u of urls) {
      const d = extractDomain(u);
      if (d) urlDomains.push(d);
    }
  }

  // Caps-lock / shouting detection: needs ≥5 letters and ≥80% uppercase
  let isAllCaps = false;
  if (text && text.length >= 5) {
    const letters = text.match(/\p{L}/gu) || [];
    if (letters.length >= 5) {
      const upper = letters.filter(c => c === c.toUpperCase() && c !== c.toLowerCase()).length;
      if (upper / letters.length >= 0.8) isAllCaps = true;
    }
  }

  // Pre-compute expensive text analyses once (avoid double work across total+chat stats)
  const emojis = text ? extractEmojis(text) : [];
  const words = text ? extractWords(text) : [];

  return {
    chatId, authorId, timestamp,
    outgoing, incoming,
    kind, text, mediaType, mediaTypes,
    reactions, quote, quoteAuthorId, quoteTargetTimestamp, quoteText,
    linkPreview, linkPreviewUrls, urlDomains,
    hasAttachment, attachmentCount,
    stickerPackId, isDeleted, isViewOnce, isPoll, isSystem, isEdited,
    systemLabel, systemType,
    callType, callDirection, callMissed, callAccepted,
    textFormats, mentionAuthors,
    deliveryMs, readMs,
    isAllCaps,
    emojis, words,
  };
}

// Helper: extract host from URL (best-effort; returns null on parse failure)
function extractDomain(url) {
  try {
    const u = new URL(url);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    if (host.startsWith('m.')) host = host.slice(2);
    return host;
  } catch (e) {
    return null;
  }
}

// ============ AGGREGATION ============
function aggregateAll() {
  // Sort messages in chats by timestamp
  for (const chat of STATE.chats.values()) {
    chat.messages.sort((a, b) => a.timestamp - b.timestamp);
    chat.stats = computeChatStats(chat);
  }
  STATE.messages.sort((a, b) => a.timestamp - b.timestamp);
  STATE.totalStats = computeTotalStats();
}
