(() => {
  const $ = id => document.getElementById(id);
  const token = document.querySelector('meta[name="hub-token"]')?.content;
  if (!token) return;
  let latest, pending = false, lastManualReport;
  const buttons = [...document.querySelectorAll('[data-task]')];
  const labels = { running: 'Đang chạy', stopping: 'Đang dừng', stopped: 'Đã dừng', success: 'Thành công', failed: 'Thất bại' };
  async function request(path, body) {
    const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'X-Hub-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không kết nối được Hub.');
    return data;
  }
  function render(data) {
    latest = data;
    const busy = pending || ['running', 'stopping'].includes(data.job?.status);
    const localBusy = ['running', 'stopping'].includes(data.local?.status);
    for (const button of buttons) button.disabled = button.dataset.task === 'stop' ? pending || (!busy && !localBusy) : button.dataset.task === 'demo-stop' ? pending || data.job?.kind !== 'demo' || !['running', 'stopping'].includes(data.job.status) : busy || (['model', 'local'].includes(button.dataset.task) && localBusy);
    for (const field of document.querySelectorAll('#demoConfig input, #demoConfig select')) field.disabled = busy;
    $('modelSelect').disabled = busy || localBusy;
    $('deployTarget').disabled = busy;
    $('currentModel').textContent = `Local: ${data.model} · reasoning: ${data.effort}${data.hasKey ? '' : ' · chưa có OPENAI_API_KEY'}`;
    $('taskSummary').textContent = [data.job ? `${data.job.kind}: ${labels[data.job.status] || data.job.status}` : 'Chưa chạy task', data.local ? `Local: ${labels[data.local.status] || data.local.status}` : 'Local chưa chạy'].join(' · ');
    const text = [data.job?.log, data.local ? '\n── APP LOCAL ──\n' + data.local.log : ''].filter(Boolean).join('\n');
    const log = $('taskLog'), atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    if (log.textContent !== text) { log.textContent = text || 'Log sẽ xuất hiện ở đây.'; if (atBottom) log.scrollTop = log.scrollHeight; }
    $('localAppLink').hidden = !localBusy;
  }
  const caseFields = [...document.querySelectorAll('.test-case')].map(item => {
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.value = item.id; input.checked = true; input.disabled = true; input.dataset.demoCase = '';
    label.append(input, document.createTextNode(item.querySelector('summary').textContent.trim())); return label;
  });
  $('demoCases').replaceChildren(...caseFields);
  $('demoAll').onchange = () => { for (const field of document.querySelectorAll('[data-demo-case]')) field.checked = $('demoAll').checked; };
  for (const field of document.querySelectorAll('[data-demo-case]')) field.onchange = () => {
    const checked = [...document.querySelectorAll('[data-demo-case]')].filter(f => f.checked).length;
    $('demoAll').checked = checked === caseFields.length; $('demoAll').indeterminate = checked > 0 && checked < caseFields.length;
  };
  async function refresh() {
    try {
      const data = await request('/hub/state');
      if (!latest) {
        $('modelSelect').replaceChildren(...data.models.map(model => {
          const option = document.createElement('option'); option.value = model.id; option.textContent = model.label; return option;
        }));
        if (data.models.some(m => m.id === data.model)) $('modelSelect').value = data.model;
        $('runnerStatus').textContent = 'Đã kết nối server local.';
      }
      render(data);
      try {
        const report = await request('/hub/manual-results');
        const signature = JSON.stringify(report);
        if (report && signature !== lastManualReport) {
          mergeManualResults(report);
          lastManualReport = signature;
        }
      } catch (e) { $('runnerStatus').textContent = 'Đồng bộ manual: ' + e.message; }
    } catch (e) {
      $('runnerStatus').textContent = e.message + ' Chạy lại npm run hub rồi tải lại trang.';
      for (const button of buttons) button.disabled = true;
      for (const field of document.querySelectorAll('#demoConfig input, #demoConfig select')) field.disabled = true;
    }
  }
  for (const button of buttons) button.onclick = async () => {
    const task = button.dataset.task;
    const target = $('deployTarget').value;
    let demo;
    if (task === 'demo') {
      const cases = [...document.querySelectorAll('[data-demo-case]:checked')].map(field => field.value);
      if (!cases.length) { $('runnerStatus').textContent = 'Chọn ít nhất một test case.'; return; }
      if (!$('demoUrl').reportValidity()) return;
      demo = { cases: cases.join(','), voice: $('demoVoice').value, url: $('demoUrl').value };
    }
    if (task === 'deploy' && !confirm(`Deploy app lên ${target === 'production' ? 'PRODUCTION (cập nhật site đang dùng)' : 'Preview'} với model ${latest.model}? Hub không được deploy. OPENAI_API_KEY phải có trên Vercel.`)) return;
    pending = true; render(latest);
    try {
      const data = await request('/hub/action', { task, ...demo, ...(task === 'model' ? { model: $('modelSelect').value } : {}), ...(task === 'deploy' ? { target } : {}) });
      $('runnerStatus').textContent = task === 'model' ? 'Đã lưu model vào .env. Khởi chạy lại app local để áp dụng.' : 'Đã nhận task. Theo dõi kết quả trong log.';
      render(data);
    } catch (e) { $('runnerStatus').textContent = e.message; }
    finally { pending = false; if (latest) render(latest); }
  };
  refresh();
  setInterval(refresh, 1500);
})();
