const PROFILE_KEY = 'love-interpreter.preferences.v1';
function validProfile(value) {
  return value && value.onboardingCompleted === true && ['vi', 'en'].includes(value.language)
    && ['gf', 'bf'].includes(value.direction) && typeof value.partnerName === 'string'
    && value.partnerName.trim().length > 0 && value.partnerName.length <= 60 && !/[\u0000-\u001f\u007f]/u.test(value.partnerName);
}
let setupStep = 0;
for (const id of ['setupLanguage', 'setupDirection']) $(id).onfocus = () => animateBot($('setupBot'), 'choose');
$('setupName').onfocus = () => animateBot($('setupBot'), 'input');
function renderLanguage() {
  document.documentElement.lang = language;
  document.title = language === 'en' ? 'Love Interpreter 💘' : 'Thông Dịch Viên Tình Yêu 💘';
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  for (const attr of ['aria-label', 'placeholder', 'alt', 'title']) {
    document.querySelectorAll(`[data-i18n-${attr}]`).forEach(node => node.setAttribute(attr, t(node.getAttribute(`data-i18n-${attr}`))));
  }
  setDir(dir);
  const dangerLabel = t(resultDanger === null || resultDanger < 40 ? 'Êm đẹp' : resultDanger < 70 ? 'Có mùi dỗi' : 'Báo động đỏ', resultDanger === null ? language : resultLanguage);
  $('dangerLabel').textContent = dangerLabel;
  if (resultDanger !== null) $('dangerMeter').setAttribute('aria-valuetext', `${resultDanger}% — ${dangerLabel}`);
  renderSetup();
  $('inputBubble').textContent = t('Bạn nhập lời nhắn hoặc gửi ảnh đoạn chat nhé 💌');
  $('inputTitle').textContent = profile ? (language === 'en' ? `💌 What did ${profile.partnerName} say?` : `💌 ${profile.partnerName} nói gì?`) : t('💌 Người ấy nói gì?');
}
function renderSetup() {
  for (const [i, id] of ['languageStep', 'directionStep', 'nameStep'].entries()) $(id).hidden = i !== setupStep;
  $('setupBack').hidden = setupStep === 0;
  $('setupNext').hidden = setupStep === 2;
  $('reviewSetup').hidden = setupStep !== 2;
  $('setupNext').textContent = t(setupStep === 0 ? 'Làm quen với Tim' : 'Tiếp tục');
  for (const [id, value] of [['chooseGf', 'gf'], ['chooseBf', 'bf']]) $(id).setAttribute('aria-pressed', String($('setupDirection').value === value));
  const chips = [setupStep > 0 ? ($('setupLanguage').value === 'en' ? 'English' : 'Tiếng Việt') : '', setupStep > 1 ? t($('setupDirection').value === 'bf' ? 'Bạn trai' : 'Bạn gái') : ''].filter(Boolean);
  $('setupProgress').replaceChildren(...chips.map(text => { const chip = document.createElement('span'); chip.textContent = text; return chip; }));
  const reviewing = !$('setupReview').hidden;
  $('setupProgress').hidden = flow !== 'wizard';
  $('voiceSetup').hidden = reviewing;
  $('flowCurrent').textContent = t(FLOW_LABELS[flow]);
  for (const button of document.querySelectorAll('[data-flow]')) button.setAttribute('aria-current', String(button.dataset.flow === flow));
  for (const input of document.querySelectorAll('#letterFlow [type="radio"]')) input.checked = input.value === $(input.name === 'letterLanguage' ? 'setupLanguage' : 'setupDirection').value;
  $('letterName').value = $('setupName').value;
  $('setupBubble').textContent = reviewing ? (language === 'en' ? `All set! I'll help you read ${$('setupName').value}'s words, in ${$('setupLanguage').value === 'en' ? 'English' : 'Vietnamese'} 💌` : `Được rồi! Mình sẽ cùng bạn đọc lời của ${$('setupName').value}, bằng ${$('setupLanguage').value === 'en' ? 'tiếng Anh' : 'tiếng Việt'} 💌`) : t(FLOW_INTROS[flow] || ['Chào bạn! Mình là Tim 💗 Cùng gỡ rối lời người ấy nhé?', 'Hôm nay mình cùng giải mã lời của ai?', 'Mình gọi người ấy là gì nhỉ?'][setupStep]);
}
function showFlowView() {
  for (const [name, id] of Object.entries(FLOW_VIEWS)) $(id).hidden = name !== flow;
  $('setupReview').hidden = true;
}
function startFlow(voice = null) {
  flowRun++;
  showFlowView();
  $('letterFlow').className = 'letter';
  setupError();
  const hasDirection = ['gf', 'bf'].includes($('setupDirection').value);
  if (flow === 'wizard') { showSetupStep(voice ? (hasDirection ? 2 : 1) : 0); return; }
  setupStep = 0;
  renderSetup();
  animateBot($('setupBot'), 'greet');
  if (flow === 'chat') runChat(voice?.language, voice?.transcript);
  if (flow === 'swipe') { swipeStep = voice ? (hasDirection ? 2 : 1) : 0; renderSwipe(); }
}
function readSetup() {
  const name = $('setupName').value.trim();
  if (!['vi', 'en'].includes($('setupLanguage').value) || !['gf', 'bf'].includes($('setupDirection').value) || !name || name.length > 60 || /[\u0000-\u001f\u007f]/u.test(name)) {
    setupError(t('Vui lòng chọn ngôn ngữ, người ấy và nhập tên (tối đa 60 ký tự).')); return null;
  }
  setupError();
  $('setupName').value = name;
  return name;
}
function showReview() {
  $('setupSummary').textContent = `${$('setupLanguage').value === 'en' ? 'English' : 'Tiếng Việt'} · ${t($('setupDirection').value === 'bf' ? 'Bạn trai' : 'Bạn gái')} · ${$('setupName').value}`;
  for (const id of Object.values(FLOW_VIEWS)) $(id).hidden = true;
  $('setupReview').hidden = false;
  renderSetup(); animateBot($('setupBot'), 'greet');
  $('reviewTitle').focus();
}
function finishSetup() {
  profile = { language: $('setupLanguage').value, direction: $('setupDirection').value, partnerName: $('setupName').value.trim(), onboardingCompleted: true };
  if (!validProfile(profile)) return;
  enterApp();
  newConversation();
  saveProfile();
}
function showSetupStep(step) {
  setupStep = step;
  $('setupForm').hidden = false; $('setupReview').hidden = true;
  setupError(); renderSetup();
  animateBot($('setupBot'), ['greet', 'choose', 'input'][step]);
  $(['setupLanguage', 'chooseGf', 'setupName'][step]).focus();
}
$('setupNext').onclick = () => {
  if (recording) return;
  if (setupStep === 1 && !['gf', 'bf'].includes($('setupDirection').value)) { setupError(t('Chọn bạn gái hoặc bạn trai để Tim hướng dẫn tiếp nhé.')); return; }
  showSetupStep(Math.min(2, setupStep + 1));
};
$('setupBack').onclick = () => { if (!recording) showSetupStep(Math.max(0, setupStep - 1)); };
for (const [id, value] of [['chooseGf', 'gf'], ['chooseBf', 'bf']]) $(id).onclick = () => { $('setupDirection').value = value; setupError(); renderSetup(); animateBot($('setupBot'), 'choose'); };
function setupError(text = '') { $('setupError').textContent = text; $('setupError').hidden = !text; }
function saveProfile() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); $('status').textContent = ''; }
  catch { $('status').textContent = t('Không lưu được trên thiết bị này. Thiết lập vẫn dùng được trong phiên hiện tại.'); }
}
function enterApp() {
  language = profile.language;
  setDir(profile.direction);
  renderLanguage();
  $('onboarding').hidden = true;
  $('app').hidden = false;
  $('settings').hidden = false;
  if (!conversation) newConversation();
  renderHistory(); renderConversation();
  $('text').focus();
}
function openSetup() {
  stopSpeech();
  animateBot($('setupBot'), 'greet');
  $('setupLanguage').value = profile?.language || language;
  $('setupDirection').value = '';
  $('setupName').value = '';
  $('setupTranscript').textContent = '';
  $('setupTranscript').hidden = true;
  $('setupStatus').textContent = '';
  setupError();
  $('app').hidden = $('settings').hidden = $('historyPanel').hidden = true;
  $('onboarding').hidden = false;
  $('cancelSetup').hidden = !profile;
  startFlow();
  $('onboardingTitle').focus();
}
$('settings').onclick = openSetup;
$('setupLanguage').onchange = () => { language = $('setupLanguage').value; renderLanguage(); setupError(); };
$('setupForm').onsubmit = event => {
  event.preventDefault();
  if (recording) return;
  if (setupStep < 2 && (!$('setupDirection').value || !$('setupName').value.trim())) { $('setupNext').onclick(); return; }
  if (readSetup()) showReview();
};
$('editSetup').onclick = () => {
  if (flow !== 'swipe') { showSetupStep(2); return; }
  showFlowView(); swipeStep = 2; renderSetup(); renderSwipe();
};
$('confirmSetup').onclick = () => { if (!$('setupReview').hidden) finishSetup(); };

let recording = null;
function releaseRecording(session) {
  clearTimeout(session.timer);
  session.stream?.getTracks().forEach(track => track.stop());
}
function recordingControls(busy) {
  for (const id of ['setupLanguage', 'setupDirection', 'setupName', 'reviewSetup', 'setupNext', 'setupBack', 'chooseGf', 'chooseBf']) $(id).disabled = busy;
  for (const id of ['letterFlow', 'chatFlow', 'swipeFlow']) $(id).inert = busy;
  $('cancelRecording').hidden = !busy;
  $('recordSetup').disabled = busy;
  $('recordSetup').textContent = t('🎤 Thiết lập bằng giọng nói');
}
function cancelRecording() {
  if (!recording) return;
  const session = recording;
  session.canceled = true;
  session.chunks = [];
  session.controller.abort();
  releaseRecording(session);
  if (session.recorder?.state === 'recording') session.recorder.stop();
  recording = null;
  recordingControls(false);
  $('setupStatus').textContent = t('Đã hủy bản ghi.');
}
$('cancelRecording').onclick = cancelRecording;
$('cancelSetup').onclick = () => { cancelRecording(); if (profile) enterApp(); };
$('recordSetup').onclick = async () => {
  if (recording) {
    if (recording.recorder?.state === 'recording') { recording.recorder.stop(); releaseRecording(recording); $('recordSetup').disabled = true; }
    return;
  }
  setupError();
  $('setupTranscript').hidden = true;
  $('setupTranscript').textContent = '';
  const session = { controller: new AbortController(), chunks: [], bytes: 0, canceled: false };
  recording = session;
  recordingControls(true);
  $('setupStatus').textContent = '';
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording unsupported');
    session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (session.canceled) { releaseRecording(session); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('Audio format unsupported');
    const recorder = session.recorder = new MediaRecorder(session.stream, { mimeType: mime, audioBitsPerSecond: 64000 });
    recorder.ondataavailable = event => {
      if (session.canceled) return;
      session.bytes += event.data.size;
      if (session.bytes <= 2 * 1024 * 1024) session.chunks.push(event.data);
      else if (recorder.state === 'recording') { recorder.stop(); releaseRecording(session); }
    };
    recorder.onerror = () => {
      cancelRecording();
      setupError(t('Không thể ghi âm. Bạn vẫn có thể nhập bằng tay.'));
    };
    recorder.onstop = async () => {
      releaseRecording(session);
      if (session.canceled) return;
      $('recordSetup').disabled = true;
      $('setupStatus').textContent = t('Đang xử lý bản ghi…');
      try {
        if (!session.bytes || session.bytes > 2 * 1024 * 1024) throw new Error(t('Không có âm thanh hoặc bản ghi vượt quá 2 MB. Hãy ghi lại.'));
        const blob = new Blob(session.chunks, { type: mime });
        session.chunks = [];
        const audio = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error(t('Có lỗi xảy ra, thử lại nhé.'))); reader.readAsDataURL(blob);
        });
        if (session.canceled) return;
        const response = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio, language }), signal: session.controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t('Có lỗi xảy ra, thử lại nhé.'));
        if (session.canceled) return;
        if (['vi', 'en'].includes(data.language)) { language = data.language; $('setupLanguage').value = language; renderLanguage(); }
        if (['gf', 'bf'].includes(data.direction)) $('setupDirection').value = data.direction;
        if (typeof data.partnerName === 'string') $('setupName').value = data.partnerName;
        startFlow({ language: ['vi', 'en'].includes(data.language), transcript: data.transcript });
        $('setupTranscript').textContent = data.transcript;
        $('setupTranscript').hidden = false;
        $('setupStatus').textContent = t('Đã điền theo lời nói. Kiểm tra và bổ sung các trường còn thiếu trước khi lưu.');
      } catch (e) {
        if (!session.canceled) { $('setupStatus').textContent = ''; setupError(e.message || t('Có lỗi xảy ra, thử lại nhé.')); }
      } finally {
        session.chunks = [];
        if (recording === session) { recording = null; recordingControls(false); }
      }
    };
    recorder.start(250);
    // shortcut: duration is limited by the browser; the server enforces the audio byte limit.
    session.timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); releaseRecording(session); }, 30000);
    $('recordSetup').disabled = false;
    $('recordSetup').textContent = t('Dừng và xử lý');
    $('setupStatus').textContent = t('Đang ghi âm… Tối đa 30 giây.');
  } catch {
    releaseRecording(session);
    if (recording === session) { recording = null; recordingControls(false); $('setupStatus').textContent = ''; setupError(t('Không thể ghi âm. Bạn vẫn có thể nhập bằng tay.')); }
  }
};
window.addEventListener('pagehide', cancelRecording);
try {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (raw) {
    if (raw.length > 5000000) throw new Error('History too large');
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved) || !saved.every(validConversation)) throw new Error('Invalid history');
    savedConversations = saved;
  }
} catch { $('historyStatus').textContent = t('Không thể đọc lịch sử trên thiết bị.'); }
try {
  const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
  if (validProfile(saved)) profile = saved;
} catch { /* Local storage is optional; manual setup stays available. */ }
renderLanguage();
if (profile) enterApp(); else openSetup();
