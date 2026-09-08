const MAX_IMPORT_ROWS = 100;

function parseCsvMatrix(input = '') {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell || '').trim()));
}

function key(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function parseManualImportCsv(input = '') {
  const matrix = parseCsvMatrix(input);
  if (matrix.length < 2) throw new Error('CSV must include a header row and at least one content row.');
  const headers = matrix[0].map(key);
  const required = ['caption'];
  for (const name of required) {
    if (!headers.includes(name)) throw new Error(`CSV is missing the required "${name}" column.`);
  }
  const body = matrix.slice(1);
  if (body.length > MAX_IMPORT_ROWS) throw new Error(`Import up to ${MAX_IMPORT_ROWS} posts at a time.`);

  return body.map((cells, index) => {
    const record = {};
    headers.forEach((header, column) => {
      if (header) record[header] = String(cells[column] ?? '').trim();
    });
    record.__row = index + 2;
    if (!record.caption) throw new Error(`CSV row ${record.__row} is missing a caption.`);
    return record;
  });
}

function splitMulti(value = '') {
  return [...new Set(String(value || '').split(/[;|]/).map((item) => item.trim()).filter(Boolean))];
}

module.exports = { MAX_IMPORT_ROWS, parseCsvMatrix, parseManualImportCsv, splitMulti };
