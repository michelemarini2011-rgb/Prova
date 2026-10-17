'use strict';
// Convertitore Markdown ridotto, pensato per testi narrativi:
//   # Titolo / ## Sottotitolo   →  intestazioni
//   *** oppure * * *            →  stacco di scena
//   > testo                     →  citazione / epigrafe
//   *corsivo*, **grassetto**    →  enfasi
//   righe vuote                 →  separano i paragrafi
// Tutto l'HTML presente nel testo viene neutralizzato.

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s) {
  const typographic = s
    .replace(/(^|[\s(])"(?=\S)/g, '$1“')
    .replace(/"/g, '”')
    .replace(/--/g, '—');
  return escapeHtml(typographic)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function render(markdown) {
  const blocks = markdown.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const html = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    let m;
    if (/^(\*\s*){3,}$/.test(block)) {
      html.push('<hr class="scene-break">');
    } else if ((m = block.match(/^(#{1,3})\s+(.+)$/))) {
      const level = m[1].length;
      html.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if (block.startsWith('>')) {
      const lines = block.split('\n').map((l) => inline(l.replace(/^>\s?/, '')));
      html.push(`<blockquote>${lines.join('<br>')}</blockquote>`);
    } else {
      html.push(`<p>${inline(block.replace(/\n/g, ' '))}</p>`);
    }
  }
  return html.join('\n');
}

function countWords(markdown) {
  return (markdown.match(/[\p{L}\p{N}’']+/gu) || []).length;
}

module.exports = { render, countWords, escapeHtml };
