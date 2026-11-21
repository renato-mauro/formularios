// Nome técnico a partir de um texto: minúsculas, sem acentos, "_" no lugar do resto.
export function slug(text) {
  const t = text.trim();
  if (/^n\s*[º°]\.?$/i.test(t)) return 'numero';
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
