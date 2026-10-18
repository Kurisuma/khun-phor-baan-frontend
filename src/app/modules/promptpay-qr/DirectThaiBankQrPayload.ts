export interface DirectThaiBankQrInput {
  bankCode: string;
  bankAccountNumber: string;
  amountCents: number;
  invoiceNumber: string;
  customerId: string;
  merchantName?: string;
  merchantCity?: string;
  merchantCategoryCode?: string;
  aid?: string;
}

export interface DirectThaiBankQrResult {
  payload: string;
  crc: string;
  amount: string;
  bankNumericCode: string;
}

const DEFAULT_DIRECT_BANK_TRANSFER_AID = 'A000000677010112';
const THB_CURRENCY_CODE = '764';
const COUNTRY_CODE_TH = 'TH';

const THAI_BANK_NUMERIC_CODES: Record<string, string> = {
  BBL: '002',
  KBANK: '004',
  KTB: '006',
  TTB: '011',
  TMBTHANACHART: '011',
  SCB: '014',
  BAY: '025',
  GSB: '030',
  BAAC: '034',
  UOB: '024',
  CIMB: '022',
  LHBANK: '073',
};

export function supportsDirectThaiBankQr(bankCode: string): boolean {
  const code = String(bankCode ?? '').trim().toLocaleUpperCase('en-US');
  return /^\d{3}$/.test(code) || code in THAI_BANK_NUMERIC_CODES;
}

export function buildDirectThaiBankQrPayload(input: DirectThaiBankQrInput): DirectThaiBankQrResult {
  const bankNumericCode = normalizeBankCode(input.bankCode);
  const accountNumber = normalizeBankAccountNumber(input.bankAccountNumber);
  const amount = formatAmountFromCents(input.amountCents);
  const invoiceNumber = normalizeReference(input.invoiceNumber, 'invoiceNumber', 25);
  const customerId = normalizeReference(input.customerId, 'customerId', 25);
  const merchantName = normalizeMerchantText(input.merchantName ?? 'KHUN PHOR BAAN', 25);
  const merchantCity = normalizeMerchantText(input.merchantCity ?? 'BANGKOK', 15);
  const merchantCategoryCode = normalizeMcc(input.merchantCategoryCode ?? '0000');
  const aid = normalizeAid(input.aid ?? DEFAULT_DIRECT_BANK_TRANSFER_AID);

  const merchantAccountInfo = [
    tlv('00', aid),
    tlv('01', bankNumericCode),
    tlv('02', accountNumber),
    tlv('03', 'BANK_TRANSFER'),
  ].join('');

  const additionalData = [
    tlv('01', invoiceNumber),
    tlv('06', customerId),
  ].join('');

  const withoutCrc = [
    tlv('00', '01'),
    tlv('01', '12'),
    tlv('30', merchantAccountInfo),
    tlv('52', merchantCategoryCode),
    tlv('53', THB_CURRENCY_CODE),
    tlv('54', amount),
    tlv('58', COUNTRY_CODE_TH),
    tlv('59', merchantName),
    tlv('60', merchantCity),
    tlv('62', additionalData),
    '6304',
  ].join('');
  const crc = crc16CcittFalse(withoutCrc);

  return {
    payload: `${withoutCrc}${crc}`,
    crc,
    amount,
    bankNumericCode,
  };
}

export function crc16CcittFalse(value: string): string {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag: string, value: string): string {
  if (!/^\d{2}$/.test(tag)) throw new Error(`Invalid TLV tag: ${tag}`);
  if (value.length > 99) throw new Error(`TLV value too long for tag ${tag}`);
  return `${tag}${value.length.toString().padStart(2, '0')}${value}`;
}

function normalizeBankCode(value: string): string {
  const code = String(value ?? '').trim().toLocaleUpperCase('en-US');
  if (/^\d{3}$/.test(code)) return code;
  const mapped = THAI_BANK_NUMERIC_CODES[code];
  if (!mapped) throw new Error(`Unsupported Thai bank code: ${value}`);
  return mapped;
}

function normalizeBankAccountNumber(value: string): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 20) throw new Error('Bank account number must contain 6 to 20 digits.');
  return digits;
}

function formatAmountFromCents(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('amountCents must be a positive integer.');
  return (amountCents / 100).toFixed(2);
}

function normalizeReference(value: string, field: string, maxLength: number): string {
  const normalized = String(value ?? '').trim().toLocaleUpperCase('en-US').replace(/[^A-Z0-9\-_.]/g, '');
  if (!normalized) throw new Error(`${field} is required.`);
  if (normalized.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters.`);
  return normalized;
}

function normalizeMerchantText(value: string, maxLength: number): string {
  const normalized = String(value ?? '').trim().toLocaleUpperCase('en-US').replace(/[^A-Z0-9 .,&'\-]/g, '');
  if (!normalized) throw new Error('Merchant text is required.');
  return normalized.slice(0, maxLength);
}

function normalizeMcc(value: string): string {
  const mcc = String(value ?? '').trim();
  if (!/^\d{4}$/.test(mcc)) throw new Error('Merchant category code must be exactly 4 digits.');
  return mcc;
}

function normalizeAid(value: string): string {
  const aid = String(value ?? '').trim().toLocaleUpperCase('en-US');
  if (!/^[A-Z0-9]{10,32}$/.test(aid)) throw new Error('AID must be uppercase alphanumeric and between 10 and 32 characters.');
  return aid;
}
