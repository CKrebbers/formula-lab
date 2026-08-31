// Formula textarea + error display with a caret at the exact column.

const DEBOUNCE_MS = 250;

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} errorEl
 * @param {(source: string) => void} onFormula — should throw (ParseError or
 *   TranspileError/GLError) on invalid input; the error is displayed.
 */
export function initEditor(textarea, errorEl, onFormula) {
  let timer = null;

  function apply() {
    const source = textarea.value;
    try {
      onFormula(source);
      errorEl.hidden = true;
      errorEl.textContent = '';
    } catch (err) {
      errorEl.hidden = false;
      errorEl.textContent = formatError(source, err);
    }
  }

  textarea.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(apply, DEBOUNCE_MS);
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      apply();
    }
  });

  return { apply };
}

function formatError(source, err) {
  if (typeof err.column === 'number') {
    const caretLine = ' '.repeat(Math.max(0, err.column - 1)) + '^';
    return `${source}\n${caretLine}\n${err.message}`;
  }
  return err.message;
}
