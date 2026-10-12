// Demo switcher: every flow writes the same hidden setup fields, then shares validation and saving.
const FLOW_KEY = 'love-interpreter.onboarding-flow.v1';
const FLOW_VIEWS = { wizard: 'setupForm', letter: 'letterFlow', chat: 'chatFlow', swipe: 'swipeFlow' };
const FLOW_LABELS = { wizard: 'Từng bước', letter: 'Lá thư', chat: 'Phỏng vấn', swipe: 'Quẹt thẻ' };
const FLOW_INTROS = { letter: 'Viết giúp Tim lá thư làm quen nhé ✍️ Khoanh tròn và điền tên vào chỗ trống.', chat: 'Trả lời Tim trong khung chat bên dưới nhé 💬', swipe: 'Quẹt trái hoặc phải để chọn nhé 👆' };
let flow = 'letter', flowRun = 0, swipeStep = 0, swipeLeaving = false;
try { const saved = localStorage.getItem(FLOW_KEY); if (Object.hasOwn(FLOW_VIEWS, saved)) flow = saved; } catch { /* Letter stays the default. */ }
const tr = (vi, en) => language === 'en' ? en : vi;
const pause = ms => new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));
function timSays(text, state) { $('setupBubble').textContent = text; animateBot($('setupBot'), state); }
for (const button of document.querySelectorAll('[data-flow]')) button.onclick = () => {
  flow = button.dataset.flow;
  try { localStorage.setItem(FLOW_KEY, flow); } catch { /* The choice still applies for this session. */ }
  $('flowMenu').hidePopover?.();
  cancelRecording();
  openSetup();
};
// A · Letter: circling a choice or filling the blank writes straight into the setup fields.
for (const input of document.querySelectorAll('#letterFlow [type="radio"]')) input.onchange = () => {
  if (input.name === 'letterLanguage') { $('setupLanguage').value = input.value; $('setupLanguage').onchange(); timSays(tr('Tiếng Việt nhé, quá hợp 💗', 'English it is! 💗'), 'choose'); }
  else { $('setupDirection').value = input.value; timSays(input.value === 'gf' ? tr('Ồ, một nàng thơ 💁‍♀️', 'Ooh, a girlfriend 💁‍♀️') : tr('Ồ, một chàng trai 💁‍♂️', 'Ooh, a boyfriend 💁‍♂️'), 'choose'); }
};
$('letterName').onfocus = () => animateBot($('setupBot'), 'input');
$('letterName').oninput = () => { $('setupName').value = $('letterName').value; };
$('letterName').onchange = () => { const name = $('letterName').value.trim(); if (name) timSays(tr(`${name}… nghe là thấy thương rồi 😍`, `${name}… sounds lovely already 😍`), 'greet'); };
$('letterFlow').onsubmit = async event => {
  event.preventDefault();
  const letter = $('letterFlow');
  if (recording || letter.classList.contains('sealed') || !readSetup()) return;
  const run = flowRun;
  timSays(tr('Đóng dấu nè… cộp! 💗', 'Sealing it… stamp! 💗'), 'greet');
  letter.classList.add('sealed');
  await pause(900);
  if (run !== flowRun) return;
  letter.classList.add('flying');
  await pause(600);
  if (run === flowRun) finishSetup();
};

// B · Chat: Tim asks one question at a time; a stale run (flow restarted) stops at its next message.
const CHAT_CANCELED = Symbol('chat canceled');
function chatBubble(text, who) {
  const bubble = document.createElement('p');
  bubble.className = `msg ${who}`;
  bubble.textContent = text;
  $('chatLog').append(bubble);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
  return bubble;
}
async function chatSay(run, text, state = 'input') {
  const dots = chatBubble('', 'bot typing');
  dots.setAttribute('aria-hidden', 'true');
  animateBot($('setupBot'), state);
  await pause(500 + Math.min(text.length * 10, 600));
  dots.remove();
  if (run !== flowRun) throw CHAT_CANCELED;
  chatBubble(text, 'bot');
}
function chatAsk(options) {
  return new Promise(resolve => {
    $('chatReplies').replaceChildren(...options.map(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onclick = () => { $('chatReplies').replaceChildren(); chatBubble(label, 'me'); resolve(value); };
      return button;
    }));
    $('chatReplies').firstChild.focus({ preventScroll: true });
  });
}
function chatAskName() {
  $('chatName').disabled = $('chatSend').disabled = false;
  $('chatName').focus({ preventScroll: true });
  return new Promise(resolve => {
    $('chatBar').onsubmit = event => {
      event.preventDefault();
      const name = $('chatName').value.trim();
      if (!name) return;
      $('chatBar').onsubmit = e => e.preventDefault();
      $('chatName').value = '';
      $('chatName').disabled = $('chatSend').disabled = true;
      chatBubble(name, 'me');
      resolve(name);
    };
  });
}
async function runChat(knowsLanguage = false, transcript = '') {
  const run = flowRun;
  $('chatLog').replaceChildren(); $('chatReplies').replaceChildren();
  $('chatName').disabled = $('chatSend').disabled = true;
  $('chatBar').onsubmit = event => event.preventDefault();
  try {
    if (transcript) chatBubble(transcript, 'me');
    else await chatSay(run, tr('Chào bạn! Mình là Tim, thông dịch viên tình yêu 💘', "Hi! I'm Tim, your love interpreter 💘"), 'greet');
    if (!knowsLanguage) {
      await chatSay(run, tr('Trước tiên, lời chào nào nghe quen tai với bạn nhất?', 'First, which greeting feels most like you?'), 'choose');
      $('setupLanguage').value = await chatAsk([['vi', 'Xin chào 👋'], ['en', 'Hello 👋']]);
      $('setupLanguage').onchange();
    }
    if (!['gf', 'bf'].includes($('setupDirection').value)) {
      await chatSay(run, tr('Tuyệt! Vậy mình đọc vị ai giúp bạn đây?', 'Great! So who should I decode for you?'), 'choose');
      $('setupDirection').value = await chatAsk([['gf', tr('💁‍♀️ Bạn gái', '💁‍♀️ My girlfriend')], ['bf', tr('💁‍♂️ Bạn trai', '💁‍♂️ My boyfriend')]]);
    }
    const gf = $('setupDirection').value === 'gf';
    if (!$('setupName').value.trim()) {
      await chatSay(run, gf ? tr('Ồ, nàng tên gì thế? 👀', 'Ooh, what’s her name? 👀') : tr('Ồ, chàng tên gì thế? 👀', 'Ooh, what’s his name? 👀'));
      const name = $('setupName').value = await chatAskName();
      await chatSay(run, tr(`${name}… nghe là thấy thương rồi 😍`, `${name}… sounds lovely already 😍`), 'greet');
    }
    const name = $('setupName').value.trim(), who = t(gf ? 'bạn gái' : 'bạn trai');
    await chatSay(run, tr(`Chốt nhé: ${$('setupLanguage').value === 'en' ? 'tiếng Anh' : 'tiếng Việt'}, giải mã ${who} tên ${name}. Chuẩn chưa?`, `So: ${$('setupLanguage').value === 'en' ? 'English' : 'Vietnamese'}, decoding your ${who} ${name}. Right?`));
    const answer = await chatAsk([['ok', tr('Chuẩn, bắt đầu thôi! 🚀', 'Yep, let’s go! 🚀')], ['edit', tr('Sửa lại ✏️', 'Start over ✏️')]]);
    if (run !== flowRun) return;
    if (answer === 'edit') { $('setupDirection').value = $('setupName').value = ''; flowRun++; runChat(); return; }
    if (readSetup()) finishSetup();
  } catch (error) {
    if (error !== CHAT_CANCELED) throw error;
  }
}

// C · Swipe: two binary cards, then a name tag; the review screen confirms before saving.
const SWIPE_CARDS = [
  { field: 'setupLanguage', question: 'Bạn muốn dùng ngôn ngữ nào?', icons: '🇻🇳 🇬🇧', options: [['vi', '🇻🇳', 'Tiếng Việt'], ['en', '🇬🇧', 'English']] },
  { field: 'setupDirection', question: 'Mình đọc vị ai giúp bạn?', icons: '💁‍♀️ 💁‍♂️', options: [['gf', '💁‍♀️', 'Bạn gái'], ['bf', '💁‍♂️', 'Bạn trai']] },
];
function renderSwipe() {
  const card = SWIPE_CARDS[swipeStep], element = $('swipeCard');
  document.querySelectorAll('#swipeProgress i').forEach((dot, i) => { dot.className = i === swipeStep ? 'on' : i < swipeStep ? 'done' : ''; });
  element.hidden = $('swipeButtons').hidden = !card;
  $('swipeTag').hidden = !!card;
  if (!card) { $('swipeName').value = $('setupName').value; $('swipeName').focus({ preventScroll: true }); return; }
  const [left, right] = card.options.map(([, icon, text]) => `${icon} ${t(text)}`);
  $('swipeStampLeft').textContent = left; $('swipeStampRight').textContent = right;
  $('swipeIcons').textContent = card.icons;
  $('swipeQuestion').textContent = t(card.question);
  $('swipeHint').textContent = `← ${left} · ${right} →`;
  $('swipeLeft').textContent = `← ${left}`; $('swipeRight').textContent = `${right} →`;
  element.style.transition = 'none';
  element.style.transform = element.style.opacity = '';
  element.style.setProperty('--l', 0); element.style.setProperty('--r', 0);
  void element.offsetWidth;
  element.style.transition = '';
}
async function chooseSwipe(i) {
  const card = SWIPE_CARDS[swipeStep], element = $('swipeCard');
  if (!card || swipeLeaving || recording) return;
  swipeLeaving = true;
  const run = flowRun;
  $(card.field).value = card.options[i][0];
  element.style.setProperty(i ? '--r' : '--l', 1);
  element.style.transform = `translateX(${i ? 150 : -150}%) rotate(${i ? 24 : -24}deg)`;
  element.style.opacity = 0;
  await pause(300);
  swipeLeaving = false;
  if (run !== flowRun) return;
  if (card.field === 'setupLanguage') $('setupLanguage').onchange();
  swipeStep++;
  renderSwipe();
  animateBot($('setupBot'), swipeStep < SWIPE_CARDS.length ? 'choose' : 'input');
  if (swipeStep < SWIPE_CARDS.length) element.focus({ preventScroll: true });
}
let dragX = null, dragDx = 0;
$('swipeCard').onpointerdown = event => {
  if (swipeLeaving) return;
  dragX = event.clientX; dragDx = 0;
  $('swipeCard').setPointerCapture(event.pointerId);
  $('swipeCard').style.transition = 'none';
};
$('swipeCard').onpointermove = event => {
  if (dragX === null) return;
  dragDx = event.clientX - dragX;
  $('swipeCard').style.transform = `translateX(${dragDx}px) rotate(${dragDx / 14}deg)`;
  $('swipeCard').style.setProperty('--l', Math.min(1, Math.max(0, -dragDx) / 90));
  $('swipeCard').style.setProperty('--r', Math.min(1, Math.max(0, dragDx) / 90));
};
$('swipeCard').onpointerup = $('swipeCard').onpointercancel = () => {
  if (dragX === null) return;
  dragX = null;
  $('swipeCard').style.transition = '';
  if (Math.abs(dragDx) > 90) { chooseSwipe(dragDx < 0 ? 0 : 1); return; }
  $('swipeCard').style.transform = '';
  $('swipeCard').style.setProperty('--l', 0); $('swipeCard').style.setProperty('--r', 0);
};
$('swipeCard').onkeydown = event => {
  if (event.key === 'ArrowLeft') chooseSwipe(0);
  else if (event.key === 'ArrowRight') chooseSwipe(1);
};
$('swipeLeft').onclick = () => chooseSwipe(0);
$('swipeRight').onclick = () => chooseSwipe(1);
$('swipeName').oninput = () => { $('setupName').value = $('swipeName').value; };
$('swipeTag').onsubmit = event => { event.preventDefault(); if (!recording && readSetup()) showReview(); };
