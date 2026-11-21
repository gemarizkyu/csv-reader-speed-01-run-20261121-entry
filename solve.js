// Fast drop-in for csv-reader 1.0.0 (make.fun): byte-identical answers, faster read.
//
// Same single left-to-right pass and broken-row policy as the reference, but
// instead of one character at a time it jumps between delimiters with
// indexOf (native memchr speed) and slices fields out whole. The only
// per-character work left is inside quoted fields that actually hold a line
// break or a doubled quote, which the practice data shows are rare.
//
// Semantics, mirrored from the reference:
// - U+FEFF at the very start is dropped; a record ends at LF or CRLF and a
//   line left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (stray_cr).
// - A field opening with a quote runs to the next quote that is not doubled;
//   "" inside is one quote and each CRLF or lone CR inside reads as LF; what
//   follows the closing quote, up to the next comma or line break, is appended
//   as it stands (quote_junk, when the field ends); a quote that never closes
//   is a literal character and the text after it is read again as unquoted
//   (unterminated_quote). A quote inside an unquoted field is literal.
// - Fields stay strings, never trimmed or converted. columns is the first
//   record when header is true, else null; rows hold the records after it,
//   each padded (short_row, with fields: its field count) or cut (long_row,
//   with extra: the cut fields) to the first record's width. Each error is
//   {code, line, row}, in the order met; line is the 1-based line its record
//   starts on, counting every LF, CRLF and lone CR inside quotes, and row its
//   record's index in rows, null for the header.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The field the helpers just read, kept in run-scope slots so no array is
  // allocated per field: value, how it ended, characters the unquoted reader
  // kept (only it counts; a quoted value it starts from is not counted).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  function error(code, recordLine, recordRow) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // The next CR at or after p, or -1 when the text holds no more: indexOf
  // only ever moves forward (each call resumes past the last CR consumed),
  // so all CR scans together cost O(n) instead of one scan per field.
  let nextCR = -2;
  function crFrom(p) {
    if (nextCR === -1) return -1;
    if (nextCR === -2 || nextCR < p) nextCR = text.indexOf('\r', p);
    return nextCR;
  }

  // Reads an unquoted field from pos, starting from `init` ('' normally, the
  // quoted value for quote junk, '"' for an unterminated quote). Sets
  // fValue/fEnded/fAdded. A CR not followed by LF is dropped (stray_cr).
  function readUnquoted(init, recordLine, recordRow) {
    let value = init;
    let added = 0;
    for (;;) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      let end = len;
      let kind = END;
      if (comma !== -1 && comma < end) { end = comma; kind = COMMA; }
      if (lf !== -1 && lf < end) { end = lf; kind = LINE_BREAK; }
      const cr = crFrom(pos);
      if (cr !== -1 && cr < end) {
        if (text.charCodeAt(cr + 1) === 10) {
          // CRLF: the record ends here.
          const seg = text.slice(pos, cr);
          if (value === '') value = seg; else value += seg;
          added += cr - pos;
          pos = cr + 2;
          line += 1;
          fValue = value; fEnded = LINE_BREAK; fAdded = added;
          return;
        }
        // Lone CR: stray_cr, dropped, the field goes on after it.
        error('stray_cr', recordLine, recordRow);
        const seg = text.slice(pos, cr);
        if (value === '') value = seg; else value += seg;
        added += cr - pos;
        pos = cr + 1;
        continue;
      }
      const seg = text.slice(pos, end);
      if (value === '') value = seg; else value += seg;
      added += end - pos;
      if (kind === COMMA) {
        pos = end + 1;
        fValue = value; fEnded = COMMA; fAdded = added;
        return;
      }
      if (kind === LINE_BREAK) {
        pos = end + 1;
        line += 1;
        fValue = value; fEnded = LINE_BREAK; fAdded = added;
        return;
      }
      pos = end;
      fValue = value; fEnded = END; fAdded = added;
      return;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets
  // fValue/fEnded/fAdded. The closing quote is the first '"' not followed
  // by another '"'; a doubled quote is one literal quote.
  function readQuoted(recordLine, recordRow) {
    const open = pos;
    let q = pos + 1;
    let closedPos = -1;
    let hasDoubled = false;
    for (;;) {
      const qq = text.indexOf('"', q);
      if (qq === -1) { closedPos = -1; break; }
      if (text.charCodeAt(qq + 1) === 34) { hasDoubled = true; q = qq + 2; continue; }
      closedPos = qq;
      break;
    }
    if (closedPos === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted. line never moved during the
      // scan, so it is already the opening line again.
      pos = open + 1;
      error('unterminated_quote', recordLine, recordRow);
      readUnquoted('"', recordLine, recordRow);
      return;
    }
    // Content between the quotes. A line break inside counts once per
    // CRLF, lone CR or LF, and each CRLF or lone CR inside reads as LF.
    const raw = text.slice(open + 1, closedPos);
    const hasBreak = raw.indexOf('\r') !== -1 || raw.indexOf('\n') !== -1;
    if (hasBreak) {
      const breaks = raw.match(/\r\n|\r|\n/g);
      line += breaks ? breaks.length : 0;
    }
    let value;
    if (!hasDoubled && !hasBreak) {
      value = raw;
    } else {
      value = hasDoubled ? raw.split('""').join('"') : raw;
      if (hasBreak) value = value.replace(/\r\n?/g, '\n');
    }
    pos = closedPos + 1;
    if (pos >= len) { fValue = value; fEnded = END; fAdded = 0; return; }
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; fValue = value; fEnded = COMMA; fAdded = 0; return; }
    if (c === 10) { pos += 1; line += 1; fValue = value; fEnded = LINE_BREAK; fAdded = 0; return; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value; fEnded = LINE_BREAK; fAdded = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break (quote_junk, when the field ends).
    readUnquoted(value, recordLine, recordRow);
    if (fAdded > 0) error('quote_junk', recordLine, recordRow);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let lastQuoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        readQuoted(recordLine, recordRow);
      } else {
        lastQuoted = false;
        readUnquoted('', recordLine, recordRow);
      }
      fields.push(fValue);
      ended = fEnded;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
