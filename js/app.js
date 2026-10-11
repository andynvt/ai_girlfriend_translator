const EN_EXAMPLES = { gf: ["I'm fine", 'Whatever you want', "Go ahead, I'm not mad"], bf: ["I'm a little busy", 'Yeah', 'Let me think about it'] };
const EXAMPLES = {
  gf: ['Em không sao đâu', 'Tùy anh', 'Anh đi đi, em không giận'],
  bf: ['Anh bận chút', 'Ừ', 'Để anh suy nghĩ đã'],
};
const LOADING_LINES = [
  'Đang đếm số dấu chấm cuối câu…',
  'Đang tra từ điển Dỗi – Việt…',
  'Đang đo nhiệt độ tin nhắn… 🌡️',
  'Đang so sánh với 1.000 lần “em không sao”…',
  'Đang kiểm tra lịch sử seen không rep…',
  'Đang hỏi ý kiến hội bạn thân…',
];
let dir = 'gf', image = null;
let resultDir = 'gf';

function setDir(d) {
  dir = d;
  const examples = language === 'en' ? EN_EXAMPLES[d] : EXAMPLES[d];
  $('text').placeholder = (language === 'en' ? 'Example: ' : 'Ví dụ: ') + examples[0] + '…';
  $('chips').replaceChildren(...examples.map((t) => {
    const b = document.createElement('button');
    b.textContent = t;
    b.onclick = () => { $('text').value = t; };
    return b;
  }));
}
setDir('gf');

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t('Có lỗi xảy ra, thử lại nhé.'));
  return r;
}

function showError(msg) { $('err').textContent = msg; $('err').hidden = !msg; }
function animateBot(bot, state) {
  bot.style.animation = 'none';
  bot.setAttribute('data-state', state);
  void bot.offsetWidth;
  bot.style.animation = '';
}
for (const id of ['text', 'context']) $(id).onfocus = () => animateBot($('inputBot'), 'input');
let lastBotActivity = Date.now();
for (const event of ['pointerdown', 'keydown', 'input']) window.addEventListener(event, () => { lastBotActivity = Date.now(); });
for (const bot of document.querySelectorAll('.tim-bot')) bot.onpointerenter = event => {
  if (event.pointerType === 'touch' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  lastBotActivity = Date.now();
  const state = bot.getAttribute('data-state');
  if (state !== 'waiting' && state !== 'reading') animateBot(bot, state === 'idle' ? 'greet' : state);
};
setInterval(() => {
  if (document.hidden || Date.now() - lastBotActivity < 12000 || recording || speech || !$('loading').hidden
    || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!$('onboarding').hidden) animateBot($('setupBot'), !$('setupReview').hidden ? 'greet' : ['greet', 'choose', 'input'][setupStep]);
  else if (!$('out').hidden) animateBot($('resultBot'), 'greet');
  else animateBot($('inputBot'), 'input');
  lastBotActivity = Date.now();
}, 12000);
let speech = null;
function stopSpeech() {
  const previous = speech;
  speech = null;
  previous?.audio?.pause();
  if (previous?.url) URL.revokeObjectURL(previous.url);
  animateBot($('resultBot'), 'idle');
  $('speak').disabled = false;
  $('speak').textContent = t('🔊 Đọc tôi nghe');
}
window.addEventListener('pagehide', stopSpeech);

const maxConversationTurns = Number.isInteger(DEMO_SETTINGS.maxConversationTurns) && DEMO_SETTINGS.maxConversationTurns > 0 && DEMO_SETTINGS.maxConversationTurns <= 50 ? DEMO_SETTINGS.maxConversationTurns : 10;
const HISTORY_KEY = 'love-interpreter.conversations.v1';
let savedConversations = [], conversation = null, conversationVersion = 0;
function validConversation(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || c.id.length > 100 || !validProfile(c.profile) || typeof c.context !== 'string' || c.context.length > 1000 || !Array.isArray(c.turns) || !c.turns.length || c.turns.length > 50) return false;
  return c.turns.every((turn, i) => {
    if (!turn || !['text', 'selectedReply', 'sentReply', 'createdAt'].every(key => typeof turn[key] === 'string' && turn[key].length <= 1000) || !turn.text.trim() || !Number.isFinite(Date.parse(turn.createdAt)) || typeof turn.fromImage !== 'boolean') return false;
    if (![null, 'reply', 'avoid'].includes(turn.selection) || (turn.selection === null && (i !== c.turns.length - 1 || turn.selectedReply)) || (turn.selection !== null && !turn.selectedReply.trim())) return false;
    const a = turn.analysis;
    return a && Number.isInteger(a.danger) && a.danger >= 0 && a.danger <= 100 && ['meaning', 'reply', 'avoid'].every(key => typeof a[key] === 'string' && a[key].length <= 1000);
  });
}
function newConversation() {
  stopSpeech();
  conversationVersion++;
  conversation = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), profile: { ...(profile || { language, direction: dir, partnerName: '', onboardingCompleted: true }) }, context: '', turns: [] };
  $('text').value = $('context').value = $('sentReply').value = '';
  $('removeImage').onclick();
  $('out').hidden = true; $('empty').hidden = false; $('loading').hidden = true;
  $('go').disabled = false; $('go').textContent = t('Giải mã! ✨'); $('status').textContent = '';
  resultDanger = null;
  showError(''); renderConversation(); $('text').focus();
}
function showResult(turn) {
  const d = turn.analysis, direction = conversation.profile.direction, requestLanguage = conversation.profile.language;
    resultDir = direction;
    resultLanguage = requestLanguage;
    resultDanger = d.danger;
    $('out').setAttribute('lang', resultLanguage);
    $('meaning').textContent = d.meaning;
    $('reply').textContent = d.reply;
    $('avoid').textContent = d.avoid;
    $('dangerNum').textContent = d.danger + '%';
    const level = d.danger < 40 ? 'safe' : d.danger < 70 ? 'warning' : 'danger';
    $('dangerLabel').textContent = t({ safe: 'Êm đẹp', warning: 'Có mùi dỗi', danger: 'Báo động đỏ' }[level], requestLanguage);
    $('out').style.setProperty('--level-color', `var(--${level})`);
    $('dangerMeter').setAttribute('aria-valuenow', d.danger);
    $('dangerMeter').setAttribute('aria-valuetext', d.danger + '% — ' + $('dangerLabel').textContent);
    $('empty').hidden = true;
    $('out').hidden = false;
    $('bar').style.width = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $('bar').style.width = d.danger + '%';
    }));
    $('out').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  $('sourceReview').hidden = !turn.fromImage;
  $('sourceText').value = turn.text;
}
function renderConversation() {
  const turns = conversation?.turns || [], last = turns[turns.length - 1];
  $('turnCount').textContent = `${t('Lượt')} ${turns.length}/${maxConversationTurns}`;
  $('chooseReply').disabled = $('chooseAvoid').disabled = !last || last.selection !== null;
  $('followup').hidden = !last;
  $('followup').textContent = turns.length >= maxConversationTurns ? t('Đã đạt giới hạn. Bắt đầu cuộc trò chuyện mới để hỏi tiếp.') : last?.selection ? t(dir === 'bf' ? 'Anh ấy trả lời thế nào?' : 'Cô ấy trả lời thế nào?') : t('Chọn một câu gợi ý trước khi hỏi tiếp.');
  $('chosenResponse').hidden = !last?.selection;
  $('chosenText').textContent = last?.selection ? `${t('Bạn đã chọn:')} ${last.selectedReply}` : '';
  $('go').disabled = turns.length >= maxConversationTurns || !!(last && !last.selection);
  $('mic').disabled = $('go').disabled;
  $('conversationLog').replaceChildren(...turns.map((turn, i) => {
    const card = document.createElement('article'); card.className = 'card';
    const text = document.createElement('p'); text.textContent = `${t('Lượt')} ${i + 1} · ${t('Người ấy:')} ${turn.text}
${turn.analysis.meaning}
${t('💬 Nên trả lời')}: ${turn.analysis.reply}
${t('🙊 Tuyệt đối đừng nói')}: ${turn.analysis.avoid}
${turn.selection ? t('Bạn đã chọn:') + ' ' + turn.selectedReply : t('Chưa chọn câu trả lời')}
${turn.sentReply ? t('Đã gửi:') + ' ' + turn.sentReply : ''}`;
    card.append(text); return card;
  }));
}
function renderHistory() {
  $('historyPanel').hidden = !profile;
  const cards = savedConversations.map(c => {
    const card = document.createElement('article'); card.className = 'card';
    const title = document.createElement('p'); title.textContent = `${c.profile.partnerName} · ${c.profile.language} · ${c.turns.length} · ${new Date(c.turns[0].createdAt).toLocaleString(c.profile.language)}`;
    const open = document.createElement('button'); open.textContent = t('Xem / tiếp tục'); open.onclick = () => {
      stopSpeech(); conversationVersion++; conversation = JSON.parse(JSON.stringify(c));
      profile = { ...c.profile }; enterApp(); saveProfile();
      $('text').value = $('sentReply').value = ''; $('context').value = c.context;
      $('removeImage').onclick(); $('loading').hidden = true; showError('');
      const last = conversation.turns[conversation.turns.length - 1]; $('sentReply').value = last.sentReply;
      showResult(last); renderConversation();
    };
    const remove = document.createElement('button'); remove.textContent = t('Xóa cuộc này'); remove.onclick = () => {
      const next = savedConversations.filter(item => item.id !== c.id);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); savedConversations = next; if (conversation?.id === c.id) newConversation(); renderHistory(); }
      catch { $('historyStatus').textContent = t('Không lưu được. Phiên vẫn còn; hãy thử lưu lại trước khi đóng trang.'); }
    };
    card.append(title, open, remove); return card;
  });
  if (!cards.length) { const empty = document.createElement('p'); empty.textContent = t('Chưa có lịch sử đã lưu.'); cards.push(empty); }
  $('historyList').replaceChildren(...cards);
}
function reviewSource() {
  const last = conversation?.turns[conversation.turns.length - 1];
  if (!last) return false;
  if (last.fromImage) {
    const text = $('sourceText').value.trim();
    if (!text || text.length > 1000) { showError(t('Kiểm tra và nhập lời đọc từ ảnh trước khi lưu.')); $('sourceText').focus(); return false; }
    last.text = text;
  }
  return true;
}
function saveConversation() {
  if (!reviewSource()) return false;
  const snapshot = JSON.parse(JSON.stringify(conversation));
  if (!validConversation(snapshot)) { $('historyStatus').textContent = t('Lịch sử không hợp lệ; dữ liệu cũ được giữ nguyên.'); return false; }
  const next = [snapshot, ...savedConversations.filter(c => c.id !== snapshot.id)];
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); savedConversations = next; renderHistory(); $('historyStatus').textContent = t('Đã lưu trên thiết bị.'); return true; }
  catch { $('historyStatus').textContent = t('Không lưu được. Phiên vẫn còn; hãy thử lưu lại trước khi đóng trang.'); return false; }
}
function chooseResponse(selection) {
  const last = conversation?.turns[conversation.turns.length - 1];
  if (!last || last.selection || !reviewSource()) return;
  const selected = last.analysis[selection];
  if (!selected?.trim()) return;
  last.selection = selection; last.selectedReply = selected;
  showError(''); saveConversation();
  $('text').value = $('sentReply').value = ''; $('removeImage').onclick();
  renderConversation(); $('text').focus();
}
$('chooseReply').onclick = () => chooseResponse('reply');
$('chooseAvoid').onclick = () => chooseResponse('avoid');
$('saveConversation').onclick = saveConversation;
$('newConversation').onclick = newConversation;
$('sentReply').onchange = () => {
  const last = conversation?.turns[conversation.turns.length - 1];
  if (last?.selection) { last.sentReply = $('sentReply').value.trim(); saveConversation(); renderConversation(); }
};

async function decode() {
  if ($('go').disabled) return;
  if (!conversation) {
    const text = $('text').value, context = $('context').value, originalImage = image;
    newConversation(); $('text').value = text; $('context').value = context; image = originalImage;
  }
  const requestVersion = conversationVersion;
  const previous = conversation.turns[conversation.turns.length - 1];
  if (previous?.selection) previous.sentReply = $('sentReply').value.trim();
  const imageSnapshot = image;
  const request = { text: $('text').value, context: $('context').value, image, direction: dir, language, partnerName: profile?.partnerName || '' };
  if (conversation.turns.length) request.history = conversation.turns.map(turn => ({ text: turn.text, analysis: turn.analysis, selection: turn.selection, selectedReply: turn.selectedReply, sentReply: turn.sentReply }));
  stopSpeech();
  showError('');
  $('status').textContent = t('Đang phân tích tâm lý…');
  $('go').disabled = true;
  $('go').textContent = t('Đang phân tích tâm lý…');
  const hadResult = !$('out').hidden;
  $('empty').hidden = $('out').hidden = true;
  $('loading').hidden = false;
  let i = 0;
  const tick = () => {
    $('loadingLine').textContent = t(LOADING_LINES[i++ % LOADING_LINES.length]);
    $('loadingLine').style.animation = 'none';
    $('loadingLine').offsetWidth; // restart fade-in
    $('loadingLine').style.animation = '';
  };
  tick();
  const timer = setInterval(tick, 1100);
  try {
    const d = await (await post('/api/translate', request)).json();
    if (requestVersion !== conversationVersion) return;
    const turn = { text: imageSnapshot ? (d.sourceText || '') : request.text.trim(), analysis: { meaning: d.meaning, danger: d.danger, reply: d.reply, avoid: d.avoid }, selection: null, selectedReply: '', sentReply: '', createdAt: new Date().toISOString(), fromImage: !!imageSnapshot };
    conversation.context = request.context.trim();
    conversation.turns.push(turn);
    showResult(turn);
    renderConversation();
  } catch (e) {
    if (requestVersion !== conversationVersion) return;
    showError(e.message);
    $('out').hidden = !hadResult;
    $('empty').hidden = hadResult;
  } finally {
    clearInterval(timer);
    if (requestVersion !== conversationVersion) return;
    $('loading').hidden = true;
    $('go').disabled = false;
    $('go').textContent = t('Giải mã! ✨');
    $('status').textContent = '';
    renderConversation();
  }
}
$('go').onclick = decode;

$('pick').onclick = () => $('file').click();
$('file').onchange = () => {
  const f = $('file').files[0];
  if (!f) return;
  const version = conversationVersion;
  const fr = new FileReader();
  fr.onload = () => { if (version !== conversationVersion) return; image = fr.result; $('preview').src = image; $('attachment').hidden = false; };
  fr.readAsDataURL(f);
};
$('removeImage').onclick = () => { image = null; $('attachment').hidden = true; $('preview').removeAttribute('src'); $('file').value = ''; };

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) $('mic').hidden = true;
else $('mic').onclick = () => {
  const version = conversationVersion;
  const rec = new SR();
  rec.lang = language === 'en' ? 'en-US' : 'vi-VN';
  rec.onresult = (e) => { if (version !== conversationVersion || $('go').disabled) return; $('text').value = e.results[0][0].transcript; decode(); };
  rec.onerror = () => showError(t('Mic không nghe rõ, gõ giúp mình nhé.'));
  rec.start();
  $('mic').textContent = '👂';
  rec.onend = () => ($('mic').textContent = '🎤');
};

$('speak').onclick = async () => {
  if ($('speak').disabled) return;
  stopSpeech();
  const session = {};
  speech = session;
  $('speak').disabled = true;
  $('speak').textContent = t('Đang chuẩn bị giọng đọc…');
  try {
    const blob = await (await post('/api/speak', { text: $('meaning').textContent, direction: resultDir, language: resultLanguage })).blob();
    if (speech !== session) return;
    session.url = URL.createObjectURL(blob);
    const audio = session.audio = new Audio(session.url);
    audio.onplaying = () => { if (speech === session) animateBot($('resultBot'), 'reading'); };
    audio.onpause = () => { if (speech === session) animateBot($('resultBot'), 'idle'); };
    audio.onended = () => { if (speech === session) stopSpeech(); };
    audio.onerror = () => { if (speech === session) { stopSpeech(); showError(t('Có lỗi xảy ra, thử lại nhé.')); } };
    await audio.play();
    if (speech === session) $('speak').textContent = t('🔊 Đọc tôi nghe');
  } catch (e) {
    if (speech === session) { stopSpeech(); showError(e.message); }
  }
};
