import { normalizeStillnessNotes } from '../data/schema.js';

const STORAGE_KEY = 'focus-stillness-notes';
const MAX_NOTES = 100;
const MAX_LENGTH = 500;

export function mountStillnessNotes({ root, storage, onMessage = () => {} } = {}) {
  if (!root || !storage) return { destroy() {} };
  const input = root.querySelector('#stillnessLetterInput');
  const saveButton = root.querySelector('#saveStillnessLetter');
  const count = root.querySelector('#stillnessLetterCount');
  const total = root.querySelector('#stillnessLetterTotal');
  const list = root.querySelector('#stillnessLetterList');
  const revisitButton = root.querySelector('#revisitStillnessLetter');
  const memory = root.querySelector('#stillnessLetterMemory');
  if (!input || !saveButton || !list || !revisitButton || !memory) return { destroy() {} };

  let notes = normalizeStillnessNotes(storage.getJSON(STORAGE_KEY, []));
  let destroyed = false;

  function render() {
    count.textContent = input.value.length + ' / ' + MAX_LENGTH;
    total.textContent = String(notes.length);
    revisitButton.disabled = notes.length === 0;
    list.replaceChildren();
    if (!notes.length) {
      const empty = document.createElement('li');
      empty.className = 'stillness-letter-empty';
      empty.textContent = 'ここには、まだ何も置かれていない。';
      list.append(empty);
      return;
    }
    [...notes].reverse().forEach(note => {
      const item = document.createElement('li');
      const date = document.createElement('time');
      const text = document.createElement('div');
      const remove = document.createElement('button');
      item.className = 'stillness-letter-item';
      date.className = 'stillness-letter-date';
      date.dateTime = new Date(note.timestamp).toISOString();
      date.textContent = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(note.timestamp);
      text.className = 'stillness-letter-text';
      text.textContent = note.text;
      remove.className = 'stillness-letter-delete';
      remove.type = 'button';
      remove.dataset.letterDelete = note.id;
      remove.setAttribute('aria-label', 'この言葉を削除');
      remove.textContent = '×';
      item.append(date, remove, text);
      list.append(item);
    });
  }

  function persist(next, message) {
    if (!storage.setJSON(STORAGE_KEY, next)) {
      onMessage('書簡を保存できなかったよ。端末の空き容量を確認してね。');
      return false;
    }
    notes = next;
    render();
    if (message) onMessage(message);
    return true;
  }

  function save() {
    const text = input.value.trim().slice(0, MAX_LENGTH);
    if (!text) {
      onMessage('言葉が浮かんだときに、いつでも置いていってね。');
      return;
    }
    const timestamp = Date.now();
    const next = [...notes, {
      id: String(timestamp) + '-' + Math.random().toString(36).slice(2, 8),
      timestamp,
      text
    }].slice(-MAX_NOTES);
    if (persist(next, '言葉をここに置いたよ。')) {
      input.value = '';
      memory.hidden = true;
      memory.textContent = '';
      render();
    }
  }

  function revisit() {
    if (!notes.length) return;
    const note = notes[Math.floor(Math.random() * notes.length)];
    memory.textContent = note.text;
    memory.hidden = false;
  }

  function remove(event) {
    const button = event.target.closest('[data-letter-delete]');
    if (!button) return;
    const deleted = notes.find(note => note.id === button.dataset.letterDelete);
    const next = notes.filter(note => note.id !== button.dataset.letterDelete);
    if (persist(next, 'その言葉をしまったよ。') && deleted && memory.textContent === deleted.text) {
      memory.hidden = true;
      memory.textContent = '';
    }
  }

  input.addEventListener('input', render);
  saveButton.addEventListener('click', save);
  revisitButton.addEventListener('click', revisit);
  list.addEventListener('click', remove);
  render();

  return {
    getNotes() { return [...notes]; },
    refresh() { notes = normalizeStillnessNotes(storage.getJSON(STORAGE_KEY, [])); render(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      input.removeEventListener('input', render);
      saveButton.removeEventListener('click', save);
      revisitButton.removeEventListener('click', revisit);
      list.removeEventListener('click', remove);
    }
  };
}
