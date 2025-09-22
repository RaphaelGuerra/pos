const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const UF_SET = new Set(UF_LIST);

const BRAND_SET = new Set(['MASTERCARD', 'VISA', 'ELO', 'AMEX', 'HIPERCARD']);

const UF_CORRECTIONS = {
  HT: 'MT',
  RM: 'RN',
};

const CONFUSABLE_TRANSLATIONS = {
  O: '0',
  o: '0',
  Q: '0',
  q: '0',
  D: '0',
  d: '0',
  I: '1',
  i: '1',
  l: '1',
  L: '1',
  S: '5',
  s: '5',
  Z: '2',
  z: '2',
  B: '8',
  b: '8',
  G: '6',
  g: '6',
  T: '7',
  t: '7',
  H: '11',
  h: '11',
  C: '0',
  c: '0',
  A: '4',
  a: '4',
  E: '3',
  e: '3',
  U: '0',
  u: '0',
};

const CHANNEL_LEXICON = ['ONL-C', 'OFF-C', 'CHI-C'];
const VIA_LEXICON = ['VIA - CLIENTE', 'VIA CLIENTE', 'VIA-CLIENTE'];

function replaceNumericConfusables(value) {
  if (!value) return '';
  return String(value)
    .split('')
    .map((ch) => (CONFUSABLE_TRANSLATIONS[ch] != null ? CONFUSABLE_TRANSLATIONS[ch] : ch))
    .join('');
}

function fixDigits(value) {
  return replaceNumericConfusables(value).replace(/\D/g, '');
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[s.length][t.length];
}

function fuzzyPick(token, lexicon) {
  const clean = toCleanUpper(token);
  if (!clean) return clean;
  let best = clean;
  let bestDist = Infinity;
  lexicon.forEach((entry) => {
    const dist = levenshtein(clean, entry);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  });
  return bestDist <= 2 ? best : clean;
}

function parseAmountFromVariants(strings = []) {
  const candidates = [];
  strings.forEach((value) => {
    const matches = String(value || '').match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
    if (matches && matches.length) {
      candidates.push(matches[matches.length - 1]);
    }
  });
  if (!candidates.length) return { raw: null, amount: null };
  const unique = [...new Set(candidates)];
  let bestRaw = unique[0];
  let bestCount = 0;
  let bestDistance = Infinity;
  unique.forEach((candidate) => {
    const count = candidates.filter((value) => value === candidate).length;
    const distance = unique.reduce(
      (acc, other) => acc + (other === candidate ? 0 : levenshtein(candidate, other)),
      0,
    );
    if (count > bestCount || (count === bestCount && distance < bestDistance)) {
      bestRaw = candidate;
      bestCount = count;
      bestDistance = distance;
    }
  });
  return { raw: bestRaw, amount: parseAmount(bestRaw) };
}

function extractTokenDigits(token, sources = [], minDigits = 0) {
  const regex = new RegExp(`${token}[\s:=\-]*([A-Z0-9]+)`, 'g');
  const matches = [];
  sources.forEach((source) => {
    const normalized = toCleanUpper(source || '').replace(/[^A-Z0-9:=\-\s]/g, ' ');
    let match = regex.exec(normalized);
    while (match) {
      matches.push(match[1]);
      match = regex.exec(normalized);
    }
  });
  for (let idx = matches.length - 1; idx >= 0; idx -= 1) {
    const digits = fixDigits(matches[idx]);
    if (!digits) continue;
    if (!minDigits || digits.length >= minDigits) return digits;
  }
  return null;
}

function resolveCnpjCandidate(sources = []) {
  const candidates = new Set();
  sources.forEach((source) => {
    const digits = fixDigits(source || '');
    if (digits.length >= 14) {
      for (let i = 0; i <= digits.length - 14; i += 1) {
        candidates.add(digits.slice(i, i + 14));
      }
    }
  });
  for (const candidate of candidates) {
    if (cnpjIsValid(candidate)) return candidate;
  }
  return null;
}

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

function cleanRoiValue(value) {
  if (!value) return '';
  return normalizeWhitespace(String(value).replace(/\u00A0/g, ' '));
}

function parseAddressAndLocation(rawValue, merchant, needs) {
  const lines = String(rawValue || '')
    .split(/\n+/)
    .map((line) => sanitizeMerchantLine(line))
    .filter(Boolean);

  if (!merchant.address && lines.length) {
    merchant.address = lines[0];
  }
  if (!merchant.address) needs.add('merchant.address');

  const locationLine = lines.length > 1 ? lines.slice(1).join(' ') : lines[0] || '';
  const tokens = locationLine.split(' ').filter(Boolean);
  let stateIndex = -1;
  for (let idx = tokens.length - 1; idx >= 0; idx -= 1) {
    const token = tokens[idx];
    const corrected = UF_CORRECTIONS[token] || token;
    if (UF_SET.has(corrected)) {
      tokens[idx] = corrected;
      stateIndex = idx;
      break;
    }
  }
  if (stateIndex >= 0) {
    merchant.state = tokens[stateIndex];
    merchant.city = tokens.slice(0, stateIndex).join(' ') || null;
  } else if (tokens.length) {
    merchant.city = tokens.join(' ');
    needs.add('merchant.state');
  } else {
    needs.add('merchant.city');
    needs.add('merchant.state');
  }
  if (!merchant.city) needs.add('merchant.city');
  if (!merchant.state) needs.add('merchant.state');
}

function extractDocAuth(value, variants, needs) {
  const sources = [value, ...(variants || [])];
  const docDigits =
    extractTokenDigits('DOC', sources, 5) || extractTokenDigits('NSU', sources, 5) || null;
  const authDigits = extractTokenDigits('AUT', sources, 5);
  if (!docDigits) needs.add('doc');
  if (!authDigits) needs.add('auth');
  return { doc: docDigits, auth: authDigits };
}

function extractDateTimeChannel(value, variants, needs) {
  const sources = [value, ...(variants || [])].map((src) =>
    replaceNumericConfusables(toCleanUpper(src || '')).replace(/[^0-9A-Z/:\-\s]/g, ' '),
  );
  let dateMatch = null;
  let timeMatch = null;
  let channel = null;
  sources.forEach((source) => {
    if (!dateMatch) dateMatch = source.match(/([0-3]\d)\/(0\d|1[0-2])\/(\d{2,4})/);
    if (!timeMatch) timeMatch = source.match(/([0-2]?\d):([0-5]\d)/);
    if (!channel) {
      const tokens = source.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        const pick = fuzzyPick(token, CHANNEL_LEXICON);
        if (CHANNEL_LEXICON.includes(pick)) {
          channel = pick;
          break;
        }
        if (token === 'CHIP' || token === 'MAG') {
          channel = token;
          break;
        }
      }
    }
  });

  let datetimeLocal = null;
  if (dateMatch && timeMatch) {
    try {
      const isoDate = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      const hour = String(timeMatch[1]).padStart(2, '0');
      datetimeLocal = `${isoDate}T${hour}:${timeMatch[2]}:00`;
    } catch (err) {
      // ignore
    }
  }
  if (!datetimeLocal) needs.add('datetime_local');
  if (!channel) needs.add('channel');
  return { datetimeLocal, channel };
}

function extractAmount(value, variants, needs) {
  const sources = [...(variants || []), value].filter((v) => v != null);
  const { raw, amount } = parseAmountFromVariants(sources);
  if (!raw) {
    needs.add('amount_brl');
    needs.add('raw_amount');
    return { amount: null, raw: null };
  }
  if (amount == null) needs.add('amount_brl');
  return { amount, raw };
}

function postProcessCieloRois(roisInput = {}) {
  const needs = new Set();
  const rois = {};
  const variants = {};
  Object.entries(roisInput).forEach(([key, value]) => {
    if (value && typeof value === 'object' && ('vote' in value || 'variants' in value)) {
      const voteValue = value.vote != null ? value.vote : value.text || '';
      rois[key] = cleanRoiValue(voteValue);
      variants[key] = (value.variants || []).map((entry) => cleanRoiValue(entry));
    } else {
      rois[key] = cleanRoiValue(value);
      variants[key] = [];
    }
  });

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
    operation: 'VENDA_A_CREDITO',
    amount_brl: null,
    raw_amount: null,
    needs_user_input: [],
  };

  const roiASource = [rois.ROI_A, ...(variants.ROI_A || [])]
    .map((entry) => toCleanUpper(entry))
    .filter(Boolean)
    .join(' ');
  let detectedBrand = null;
  BRAND_SET.forEach((brand) => {
    if (!detectedBrand && roiASource.includes(brand)) detectedBrand = brand;
  });
  if (detectedBrand) result.brand = detectedBrand;
  else needs.add('brand');

  if (/DEBITO/.test(roiASource)) {
    result.mode = 'DEBITO';
  } else if (/CREDITO\s*A\s*VISTA/.test(roiASource)) {
    result.mode = 'CREDITO_A_VISTA';
  } else if (roiASource) {
    result.mode = formatEnum(roiASource) || null;
    if (!result.mode) needs.add('mode');
  } else {
    needs.add('mode');
  }

  const maskSources = [rois.ROI_B, ...(variants.ROI_B || [])].map((value) =>
    replaceNumericConfusables(String(value || '')).replace(/[^\d*]/g, ''),
  );
  let mask = null;
  maskSources.some((candidate) => {
    const match = candidate.match(/\*{6,16}\d{4}/);
    if (match) {
      mask = match[0];
      return true;
    }
    return false;
  });
  if (mask) {
    result.masked_pan = mask;
    result.card_last4 = mask.slice(-4);
  } else {
    needs.add('masked_pan');
    needs.add('card_last4');
  }

  const roiCSource = [rois.ROI_C, ...(variants.ROI_C || [])]
    .map((value) => toCleanUpper(value))
    .filter(Boolean);
  let viaDetected = false;
  roiCSource.forEach((entry) => {
    const segments = entry.split(/[\\/]/).map((segment) => normalizeWhitespace(segment));
    segments.forEach((segment) => {
      if (!viaDetected && fuzzyPick(segment, VIA_LEXICON) === 'VIA - CLIENTE') {
        viaDetected = true;
      }
    });
  });
  if (viaDetected) result.via = 'CLIENTE';
  else needs.add('via');

  const posDigits = extractTokenDigits('POS', roiCSource, 8);
  if (posDigits) result.pos_id = posDigits;
  else needs.add('pos_id');

  const cnpjSources = [rois.ROI_D, ...(variants.ROI_D || [])];
  const resolvedCnpj = resolveCnpjCandidate(cnpjSources);
  if (resolvedCnpj) {
    result.merchant.cnpj = resolvedCnpj;
  } else {
    needs.add('merchant.cnpj');
  }

  const merchantName = sanitizeMerchantLine(rois.ROI_E);
  if (merchantName) result.merchant.name = merchantName;
  else needs.add('merchant.name');

  parseAddressAndLocation(rois.ROI_F, result.merchant, needs);

  const { doc, auth } = extractDocAuth(rois.ROI_G, variants.ROI_G, needs);
  result.doc = doc;
  result.auth = auth;

  const { datetimeLocal, channel } = extractDateTimeChannel(rois.ROI_H, variants.ROI_H, needs);
  result.datetime_local = datetimeLocal;
  result.channel = channel;

  const { amount, raw } = extractAmount(rois.ROI_I, variants.ROI_I, needs);
  result.amount_brl = amount;
  result.raw_amount = raw;

  if (!result.via) needs.add('via');
  if (!result.operation) needs.add('operation');

  result.needs_user_input = Array.from(needs);
  return { rois, result, variants };
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
        const token = tokens[idx];
        const corrected = UF_CORRECTIONS[token] || token;
        if (UF_SET.has(corrected)) {
          tokens[idx] = corrected;
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

export { normalizeCieloText, parseCieloReceipt, postProcessCieloRois, cnpjIsValid };
