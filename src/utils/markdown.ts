export function escapeUnpairedSymbols(text: string): string {
  const pairedSymbols = ['*'];
  let result = '';
  let i = 0;

  while (i < text.length) {
    let foundPair = false;

    for (const sym of pairedSymbols) {
      if (text[i] === sym) {
        const closingIndex = text.indexOf(sym, i + 1);
        if (closingIndex !== -1 && closingIndex > i + 1) {
          const innerText = text.slice(i + 1, closingIndex);
          if (!innerText.includes(sym)) {
            result += text.slice(i, closingIndex + 1);
            i = closingIndex + 1;
            foundPair = true;
            break;
          }
        }
      }
    }

    if (!foundPair) {
      if (pairedSymbols.includes(text[i])) {
        result += '\\' + text[i];
      } else {
        result += text[i];
      }
      i++;
    }
  }

  return result;
}
