// Help: the User Guide (everyone) and the Manager Guide (Managers, Carlos and Systems). Written with made-up examples only.
import { S, isManager, canEditSop } from './state.js';
import { eyebrow } from './views.js';

export function helpPage() {
  const mgr = isManager() || canEditSop(), part = mgr ? S.helpPart : 'user';
  return `<section class="hero" data-key="help-hero"><div class="hero-text">${eyebrow()}<h1 class="title">Help <span class="accent">&amp; Guides</span></h1><p class="lede">How DISPO OPS works, step by step.</p></div></section>
    ${mgr ? `<section class="toolbar" data-key="help-tabs-${part}"><div class="seg" role="group"><button type="button" data-act="helpPart" data-v="user" aria-pressed="${part === 'user'}">User Guide</button><button type="button" data-act="helpPart" data-v="manager" aria-pressed="${part === 'manager'}">Manager Guide</button></div></section>` : ''}
    <section class="help" data-key="help-${part}"><div class="card"><p>The guides are being written.</p></div></section>`;
}
