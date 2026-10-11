export const message = (language, vi, en) => language === 'en' ? en : vi;
const bad = text => Object.assign(new Error(text), { status: 400 });

export function parseLanguage(value) {
  if (value === undefined) return 'vi';
  if (value !== 'vi' && value !== 'en') throw bad('Ngôn ngữ không hợp lệ / Invalid language.');
  return value;
}

export function parseName(value, language = 'vi') {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > 60 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw bad(message(language, 'Tên phải là văn bản, tối đa 60 ký tự.', 'Name must be text, up to 60 characters.'));
  }
  return value.trim();
}
