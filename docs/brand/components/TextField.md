# TextField

TextField collects one value, with its label above and one line of help or error below.

**Markup:** `<label class="sx-field"><span class="sx-label">Label</span><input class="sx-field__input" id="…"><span class="sx-field__help">Help</span></label>`. Add `.sx-field__amount` to the input for money entry (Newsreader, 32px). Add `--error` to the label for the error state.

**Rules:** labels are nouns ("Email", "Pix key"); never use a placeholder in place of a label. Help text says what happens next, in our own voice ("We'll send you a six-digit code"). Errors own the problem and offer the fix, kindly: "We couldn't find that Pix key. Double-check it, or pay Juliana by bank details instead." Amount fields show the converted amount live in the help line.

**Example:** [TextField.html](TextField.html) (text input, amount input and error state).
