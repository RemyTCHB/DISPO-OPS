// Writes docs/USER-GUIDE.md and docs/MANAGER-GUIDE.md from the in-app Help (js/help.js), so both stay the same.
import fs from 'node:fs';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const src = fs.readFileSync(new URL('../js/help.js', import.meta.url), 'utf8');
const pick = name => { const m = new RegExp('const ' + name + ' = `([\\s\\S]*?)`;').exec(src); return m[1]; };
const md = html => html
  .replace(/<ol>([\s\S]*?)<\/ol>/g, (m, body) => { let n = 0; return '\n' + body.replace(/<li>([\s\S]*?)<\/li>/g, (x, t) => `${++n}. ${t.trim().replace(/\s+/g, ' ')}`).trim() + '\n'; })
  .replace(/<h2>(.*?)<\/h2>/g, '# $1\n').replace(/<h3>(.*?)<\/h3>/g, '\n## $1\n')
  .replace(/<\/?ul>/g, '\n').replace(/<li>([\s\S]*?)<\/li>/g, (m, t) => '- ' + t.trim().replace(/\s+/g, ' '))
  .replace(/<p>([\s\S]*?)<\/p>/g, (m, t) => t.trim().replace(/\s+/g, ' ') + '\n')
  .replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .split('\n').map(l => l.trim()).join('\n')
  .replace(/^(- .*|\d+\. .*)\n\n(?=- |\d+\. )/gm, '$1\n').replace(/^(- .*|\d+\. .*)\n\n(?=- |\d+\. )/gm, '$1\n')
  .replace(/\n{3,}/g, '\n\n').trim() + '\n';
fs.mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../docs/USER-GUIDE.md', import.meta.url), md(pick('USER')));
fs.writeFileSync(new URL('../docs/MANAGER-GUIDE.md', import.meta.url), md(pick('MANAGER')));
console.log('guides written');
