export type PromptPayTargetType = 'PHONE' | 'CITIZEN_ID' | 'TAX_ID' | 'ACCOUNT';

export interface PromptPayPayloadInput {
  targetType: PromptPayTargetType | string;
  targetId: string;
  amountCents: number;
}

const PROMPTPAY_AID = 'A000000677010111';
const THB_CURRENCY_CODE = '764';
const COUNTRY_TH = 'TH';

export function buildPromptPayPayload(input: PromptPayPayloadInput): string {
  const target = normalizePromptPayTarget(input.targetType, input.targetId);
  const amount = formatAmount(input.amountCents);
  const merchantAccountInfo = tlv('00', PROMPTPAY_AID) + tlv(target.tag, target.value);
  const withoutCrc = [
    tlv('00', '01'),
    tlv('01', '12'),
    tlv('29', merchantAccountInfo),
    tlv('53', THB_CURRENCY_CODE),
    tlv('54', amount),
    tlv('58', COUNTRY_TH),
    '6304',
  ].join('');

  return `${withoutCrc}${crc16CcittFalse(withoutCrc)}`;
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

function normalizePromptPayTarget(type: PromptPayTargetType | string, targetId: string): { tag: string; value: string } {
  const normalizedType = String(type || 'PHONE').toLocaleUpperCase('en-US');
  const digits = String(targetId || '').replace(/\D/g, '');

  if (normalizedType === 'PHONE') {
    if (digits.length === 10 && digits.startsWith('0')) return { tag: '01', value: `0066${digits.slice(1)}` };
    if (digits.length === 11 && digits.startsWith('66')) return { tag: '01', value: `00${digits}` };
    if (digits.length === 13 && digits.startsWith('0066')) return { tag: '01', value: digits };
    throw new Error('PromptPay phone number must be a valid Thai mobile number.');
  }

  if (normalizedType === 'CITIZEN_ID' || normalizedType === 'TAX_ID') {
    if (digits.length !== 13) throw new Error('PromptPay citizen/tax ID must contain exactly 13 digits.');
    return { tag: '02', value: digits };
  }

  if (normalizedType === 'ACCOUNT') {
    if (digits.length < 10 || digits.length > 15) throw new Error('PromptPay account number must contain 10 to 15 digits.');
    return { tag: '03', value: digits };
  }

  throw new Error('Unsupported PromptPay target type.');
}

function formatAmount(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('PromptPay amount must be positive cents.');
  return (amountCents / 100).toFixed(2);
}

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}
