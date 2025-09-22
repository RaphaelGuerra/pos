const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const UF_SET = new Set(UF_LIST);

function stripDiacritics(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toCleanUpper(value) {
  return stripDiacritics(value || '').toUpperCase();
}

function normalizeWhitespace(value) {
  return value.replace(/[\t\f\v]+/g, ' ').replace(/ +/g, ' ').trim();
}

function normalizeCieloText(rawText) {
  if (!rawText) return '';
  let text = String(rawText);
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(/\u00A0/g, ' ');
  text = text.replace(/[\u2013\u2014\u2212]/g, '-');
  text = text.replace(/[|¦]/g, 'I');
  text = text.replace(/[“”]/g, '"');
  text = text.replace(/[’]/g, "'");
  text = text.replace(/\b[COQ][NWIU][P][J1]/gi, 'CNPJ');
  text = text.replace(/\bCL1ENTE\b/gi, 'CLIENTE');
  text = text.replace(/\bV1A\b/gi, 'VIA');
  text = text.replace(/\bONL[\s\-]+C\b/gi, 'ONL-C');
  text = text.replace(/\bSAN\b/gi, 'S/N');
  text = text.replace(/S\s*\/\s*N/gi, 'S/N');
  text = text.replace(/CRED[IÍ]TO\s*A\s*V[ÍI]STA/gi, 'CREDITO A VISTA');
  text = text.replace(/CRED[IÍ]TO\s*À\s*VISTA/gi, 'CREDITO A VISTA');
  text = text.replace(/VENDA\s*A\s*CRED[IÍ]TO/gi, 'VENDA A CREDITO');
  text = text.replace(/VIA\s*[–—-]?\s*CLIENTE/gi, 'VIA - CLIENTE');
  text = text.replace(/POS[\s-]*([0-9O]+)/gi, (_, digits) => `POS-${digits.replace(/[O]/gi, '0')}`);
  text = text.replace(/DOC[\s-]*([0-9O]+)/gi, (_, digits) => `DOC-${digits.replace(/[O]/gi, '0')}`);
  text = text.replace(/AUT[\s-]*([0-9O]+)/gi, (_, digits) => `AUT-${digits.replace(/[O]/gi, '0')}`);
  text = text.replace(/(\d)[O](\d)/g, '$10$2');
  text = text.replace(/(\d)I(\d)/g, '$11$2');
  text = text.replace(/(\d)B(\d)/g, '$18$2');
  text = text.replace(/(\d)S(\d)/g, '$15$2');
  text = text.replace(/(\d)G(\d)/g, '$16$2');
  const lines = text.split('\n').map((line) => normalizeWhitespace(line));
  return lines.join('\n').trim();
}

function cnpjIsValid(cnpj) {
  if (!cnpj || cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base, factors) => {
    let sum = 0;
    for (let i = 0; i < factors.length; i += 1) {
      sum += Number(base[i]) * factors[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const base = cnpj.slice(0, 12);
  const digit1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const digit2 = calc(base + digit1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.slice(-2) === `${digit1}${digit2}`;
}

function parseAmount(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function toIsoDate(day, month, year) {
  const yy = year.length === 2 ? (Number(year) <= 30 ? `20${year}` : `19${year}`) : year;
  const dd = day.padStart(2, '0');
  const mm = month.padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatEnum(value) {
  if (!value) return null;
  const clean = toCleanUpper(value).replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/__+/g, '_');
  return clean || null;
}

function fixAlphaNumericConfusions(value) {
  return value
    .split(' ')
    .map((token) => {
      if (!/[A-Z]/.test(token)) return token;
      return token
        .replace(/0/g, 'O')
        .replace(/1/g, 'I')
        .replace(/5/g, 'S')
        .replace(/8/g, 'B')
        .replace(/6/g, 'G');
    })
    .join(' ')
    .replace(/ +/g, ' ')
    .trim();
}

function sanitizeMerchantLine(line) {
  if (!line) return '';
  const cleaned = toCleanUpper(line).replace(/[^A-Z0-9/\-\s]/g, ' ').replace(/ +/g, ' ').trim();
  return fixAlphaNumericConfusions(cleaned);
}

function extractMerchant(lines, needs) {
  const merchant = { cnpj: null, name: null, address: null, city: null, state: null };
  let cnpjIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/CNPJ/i.test(lines[i])) {
      cnpjIndex = i;
      const match = lines[i].match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})/);
      if (match) {
        const digits = match[1].replace(/\D/g, '');
        if (cnpjIsValid(digits)) {
          merchant.cnpj = digits;
        } else {
          needs.add('merchant.cnpj');
        }
      } else {
        needs.add('merchant.cnpj');
      }
      break;
    }
  }
  if (merchant.cnpj == null) needs.add('merchant.cnpj');
  if (cnpjIndex >= 0) {
    const nameLine = sanitizeMerchantLine(lines[cnpjIndex + 1]);
    if (nameLine) merchant.name = nameLine;
    else needs.add('merchant.name');
    const addressLine = sanitizeMerchantLine(lines[cnpjIndex + 2]);
    if (addressLine) merchant.address = addressLine;
    else needs.add('merchant.address');
    const cityLine = sanitizeMerchantLine(lines[cnpjIndex + 3]);
    if (cityLine) {
      const tokens = cityLine.split(' ');
      let stateIndex = -1;
      for (let idx = tokens.length - 1; idx >= 0; idx -= 1) {
        if (UF_SET.has(tokens[idx])) {
          stateIndex = idx;
          break;
        }
      }
      if (stateIndex >= 0) {
        merchant.state = tokens[stateIndex];
        merchant.city = tokens.slice(0, stateIndex).join(' ');
      } else {
        merchant.city = tokens.join(' ');
        needs.add('merchant.state');
      }
    } else {
      needs.add('merchant.city');
      needs.add('merchant.state');
    }
  } else {
    needs.add('merchant.name');
    needs.add('merchant.address');
    needs.add('merchant.city');
    needs.add('merchant.state');
  }
  if (!merchant.name) needs.add('merchant.name');
  if (!merchant.address) needs.add('merchant.address');
  if (!merchant.city) needs.add('merchant.city');
  if (!merchant.state) needs.add('merchant.state');
  return merchant;
}

function parseCieloReceipt(rawText) {
  const normalizedText = normalizeCieloText(rawText);
  const lines = normalizedText.split('\n').filter(Boolean);
  const upperText = toCleanUpper(normalizedText);
  const needs = new Set();

  const result = {
    issuer: 'CIELO',
    brand: null,
    mode: null,
    card_last4: null,
    masked_pan: null,
    via: null,
    pos_id: null,
    merchant: { cnpj: null, name: null, address: null, city: null, state: null },
    doc: null,
    auth: null,
    datetime_local: null,
    channel: null,
    operation: null,
    amount_brl: null,
    raw_amount: null,
    needs_user_input: [],
  };

  const brandMatch = upperText.match(/\b(MASTERCARD|MASTER CARD|VISA|ELO|AMEX|AMERICAN EXPRESS|HIPERCARD|DINERS CLUB|ALELO)\b/);
  if (brandMatch) {
    const brand = brandMatch[1].replace(/\s+/g, '');
    result.brand = brand === 'MASTER CARD' ? 'MASTERCARD' : brand;
  } else {
    needs.add('brand');
  }

  const modeMatch = normalizedText.match(/CREDITO A VISTA|DEBITO|CREDITO PARCELADO|PARCELADO LOJA|PARCELADO ADM/gi);
  if (modeMatch && modeMatch.length) {
    result.mode = formatEnum(modeMatch[0]);
  } else {
    needs.add('mode');
  }

  const maskMatch = normalizedText.match(/(\*{2,}[\s*]*\d{4})/);
  if (maskMatch) {
    const compact = maskMatch[1].replace(/\s+/g, '');
    result.masked_pan = compact;
    const tail = compact.match(/(\d{4})$/);
    if (tail) result.card_last4 = tail[1];
    else needs.add('card_last4');
  } else {
    needs.add('masked_pan');
    needs.add('card_last4');
  }

  const viaMatch = normalizedText.match(/VIA\s*[-–—]?\s*([A-ZÇÃÉÊÍÓÚ ]+)/i);
  if (viaMatch) {
    const viaValue = toCleanUpper(viaMatch[1]).split(' ')[0];
    result.via = viaValue;
  } else {
    needs.add('via');
  }

  const posMatch = normalizedText.match(/POS-(\d{4,})/i);
  if (posMatch) {
    result.pos_id = posMatch[1];
  } else {
    needs.add('pos_id');
  }

  result.merchant = extractMerchant(lines, needs);

  const docMatch = normalizedText.match(/(?:DOC|NSU)-(\d{3,})/i);
  if (docMatch) result.doc = docMatch[1];
  else needs.add('doc');

  const authMatch = normalizedText.match(/AUT-(\d{3,})/i);
  if (authMatch) result.auth = authMatch[1];
  else needs.add('auth');

  const dateMatch = normalizedText.match(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/);
  const timeMatch = normalizedText.match(/\b([0-2]\d):([0-5]\d)\b/);
  if (dateMatch && timeMatch) {
    try {
      const isoDate = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      result.datetime_local = `${isoDate}T${timeMatch[1]}:${timeMatch[2]}:00`;
    } catch (err) {
      needs.add('datetime_local');
    }
  } else {
    needs.add('datetime_local');
  }

  const channelMatch = normalizedText.match(/ONL-C|ONL-[A-Z]|CHIP|MAG/g);
  if (channelMatch) {
    result.channel = toCleanUpper(channelMatch[0]);
  } else {
    needs.add('channel');
  }

  const operationMatch = normalizedText.match(/VENDA A CREDITO|VENDA A DEBITO|VENDA A VISTA/gi);
  if (operationMatch) {
    result.operation = formatEnum(operationMatch[0]);
  } else {
    needs.add('operation');
  }

  const amountMatch = normalizedText.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
  if (amountMatch) {
    result.raw_amount = amountMatch[1];
    const parsedAmount = parseAmount(amountMatch[1]);
    if (parsedAmount != null) result.amount_brl = parsedAmount;
    else needs.add('amount_brl');
  } else {
    needs.add('amount_brl');
    needs.add('raw_amount');
  }

  result.needs_user_input = Array.from(needs);
  return { normalizedText, result };
}

export { normalizeCieloText, parseCieloReceipt, cnpjIsValid };
