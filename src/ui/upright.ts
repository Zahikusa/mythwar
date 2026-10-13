import { h, onTap } from './dom.ts';

/**
 * Typing on an upright phone. The stage is turned a quarter (the lanes need the width), but the
 * keyboard opens upright — a name typed into a field on the turned stage would be read sideways.
 * While such a field has the keyboard, an upright echo of it sits at the top of the screen (on
 * the page, like the install sheet): its label, what is typed, a caret, and Done. The keys still
 * go to the real field, so everything it does on Enter, a change or leaving it stays as it is.
 */
export function uprightTyping(stage: HTMLElement, turned: () => boolean): void {
  let field: HTMLInputElement | null = null;
  const label = h('div', { class: 'uplabel' });
  const text = h('span', { class: 'uptext' });
  const done = h('button', { class: 'mbtn primary small' }, h('span', { text: 'Done' })) as HTMLButtonElement;
  const box = h('div', { class: 'upbox', role: 'presentation' }, label, h('div', { class: 'upfield' }, text, h('i', { class: 'upcaret' })), done);
  const echo = h('div', { class: 'upecho hidden', 'aria-hidden': 'true' }, box);
  document.body.appendChild(echo);

  const show = () => {
    if (!field) return;
    const v = field.value;
    text.textContent = v || field.placeholder || '';
    text.classList.toggle('empty', !v);
  };
  const close = () => {
    field = null;
    echo.classList.add('hidden');
  };
  stage.addEventListener('focusin', (e) => {
    const f = e.target;
    if (!(f instanceof HTMLInputElement) || f.type !== 'text' || !turned()) return;
    field = f;
    label.textContent = f.getAttribute('aria-label') ?? f.placeholder ?? '';
    show();
    echo.classList.remove('hidden');
  });
  stage.addEventListener('focusout', (e) => {
    if (e.target === field) close();
  });
  // (Bubbling, after the field's own listeners: the echo shows what the field kept — a room
  // code in capitals, a name cut to its limit.)
  document.addEventListener('input', (e) => e.target === field && show());
  document.addEventListener('keyup', (e) => e.target === field && show());
  // Done = leaving the field (as tapping elsewhere would): it keeps or sends what was typed.
  // (pointerdown doesn't take the focus first, so the field leaves on Done's own terms.)
  done.addEventListener('pointerdown', (e) => e.preventDefault());
  onTap(done, () => field?.blur());
}
