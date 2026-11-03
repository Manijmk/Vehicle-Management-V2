import { InvalidCurrencyCodeError } from './finance-errors.js';

export interface CurrencyMetadata {
  code: string;
  decimals: number;
  name: string;
}

/**
 * Authoritative ISO 4217 Currency Registry.
 *
 * All active ISO 4217 three-letter currency codes with their official
 * minor-unit / decimal fraction digit definitions. Fictitious or unknown
 * codes (e.g. 'ZZZ', 'ABC') are strictly rejected.
 */
export const ISO_4217_CURRENCIES: Readonly<Record<string, CurrencyMetadata>> = Object.freeze({
  AED: { code: 'AED', decimals: 2, name: 'UAE Dirham' },
  AFN: { code: 'AFN', decimals: 2, name: 'Afghan Afghani' },
  ALL: { code: 'ALL', decimals: 2, name: 'Albanian Lek' },
  AMD: { code: 'AMD', decimals: 2, name: 'Armenian Dram' },
  ANG: { code: 'ANG', decimals: 2, name: 'Netherlands Antillean Guilder' },
  AOA: { code: 'AOA', decimals: 2, name: 'Angolan Kwanza' },
  ARS: { code: 'ARS', decimals: 2, name: 'Argentine Peso' },
  AUD: { code: 'AUD', decimals: 2, name: 'Australian Dollar' },
  AWG: { code: 'AWG', decimals: 2, name: 'Aruban Florin' },
  AZN: { code: 'AZN', decimals: 2, name: 'Azerbaijani Manat' },
  BAM: { code: 'BAM', decimals: 2, name: 'Bosnia-Herzegovina Convertible Mark' },
  BBD: { code: 'BBD', decimals: 2, name: 'Barbados Dollar' },
  BDT: { code: 'BDT', decimals: 2, name: 'Bangladeshi Taka' },
  BGN: { code: 'BGN', decimals: 2, name: 'Bulgarian Lev' },
  BHD: { code: 'BHD', decimals: 3, name: 'Bahraini Dinar' },
  BIF: { code: 'BIF', decimals: 0, name: 'Burundian Franc' },
  BMD: { code: 'BMD', decimals: 2, name: 'Bermudian Dollar' },
  BND: { code: 'BND', decimals: 2, name: 'Brunei Dollar' },
  BOB: { code: 'BOB', decimals: 2, name: 'Boliviano' },
  BRL: { code: 'BRL', decimals: 2, name: 'Brazilian Real' },
  BSD: { code: 'BSD', decimals: 2, name: 'Bahamian Dollar' },
  BTN: { code: 'BTN', decimals: 2, name: 'Bhutanese Ngultrum' },
  BWP: { code: 'BWP', decimals: 2, name: 'Botswana Pula' },
  BYN: { code: 'BYN', decimals: 2, name: 'Belarusian Ruble' },
  BZD: { code: 'BZD', decimals: 2, name: 'Belize Dollar' },
  CAD: { code: 'CAD', decimals: 2, name: 'Canadian Dollar' },
  CDF: { code: 'CDF', decimals: 2, name: 'Congolese Franc' },
  CHF: { code: 'CHF', decimals: 2, name: 'Swiss Franc' },
  CLF: { code: 'CLF', decimals: 4, name: 'Unidad de Fomento' },
  CLP: { code: 'CLP', decimals: 0, name: 'Chilean Peso' },
  CNY: { code: 'CNY', decimals: 2, name: 'Chinese Yuan' },
  COP: { code: 'COP', decimals: 2, name: 'Colombian Peso' },
  CRC: { code: 'CRC', decimals: 2, name: 'Costa Rican Colon' },
  CUP: { code: 'CUP', decimals: 2, name: 'Cuban Peso' },
  CVE: { code: 'CVE', decimals: 2, name: 'Cape Verdean Escudo' },
  CZK: { code: 'CZK', decimals: 2, name: 'Czech Koruna' },
  DJF: { code: 'DJF', decimals: 0, name: 'Djiboutian Franc' },
  DKK: { code: 'DKK', decimals: 2, name: 'Danish Krone' },
  DOP: { code: 'DOP', decimals: 2, name: 'Dominican Peso' },
  DZD: { code: 'DZD', decimals: 2, name: 'Algerian Dinar' },
  EGP: { code: 'EGP', decimals: 2, name: 'Egyptian Pound' },
  ERN: { code: 'ERN', decimals: 2, name: 'Eritrean Nakfa' },
  ETB: { code: 'ETB', decimals: 2, name: 'Ethiopian Birr' },
  EUR: { code: 'EUR', decimals: 2, name: 'Euro' },
  FJD: { code: 'FJD', decimals: 2, name: 'Fiji Dollar' },
  FKP: { code: 'FKP', decimals: 2, name: 'Falkland Islands Pound' },
  GBP: { code: 'GBP', decimals: 2, name: 'Pound Sterling' },
  GEL: { code: 'GEL', decimals: 2, name: 'Georgian Lari' },
  GHS: { code: 'GHS', decimals: 2, name: 'Ghanaian Cedi' },
  GIP: { code: 'GIP', decimals: 2, name: 'Gibraltar Pound' },
  GMD: { code: 'GMD', decimals: 2, name: 'Gambian Dalasi' },
  GNF: { code: 'GNF', decimals: 0, name: 'Guinean Franc' },
  GTQ: { code: 'GTQ', decimals: 2, name: 'Guatemalan Quetzal' },
  GYD: { code: 'GYD', decimals: 2, name: 'Guyanese Dollar' },
  HKD: { code: 'HKD', decimals: 2, name: 'Hong Kong Dollar' },
  HNL: { code: 'HNL', decimals: 2, name: 'Honduran Lempira' },
  HRK: { code: 'HRK', decimals: 2, name: 'Croatian Kuna' },
  HTG: { code: 'HTG', decimals: 2, name: 'Haitian Gourde' },
  HUF: { code: 'HUF', decimals: 2, name: 'Hungarian Forint' },
  IDR: { code: 'IDR', decimals: 2, name: 'Indonesian Rupiah' },
  ILS: { code: 'ILS', decimals: 2, name: 'Israeli New Shekel' },
  INR: { code: 'INR', decimals: 2, name: 'Indian Rupee' },
  IQD: { code: 'IQD', decimals: 3, name: 'Iraqi Dinar' },
  IRR: { code: 'IRR', decimals: 2, name: 'Iranian Rial' },
  ISK: { code: 'ISK', decimals: 0, name: 'Icelandic Krona' },
  JMD: { code: 'JMD', decimals: 2, name: 'Jamaican Dollar' },
  JOD: { code: 'JOD', decimals: 3, name: 'Jordanian Dinar' },
  JPY: { code: 'JPY', decimals: 0, name: 'Japanese Yen' },
  KES: { code: 'KES', decimals: 2, name: 'Kenyan Shilling' },
  KGS: { code: 'KGS', decimals: 2, name: 'Kyrgyzstani Som' },
  KHR: { code: 'KHR', decimals: 2, name: 'Cambodian Riel' },
  KMF: { code: 'KMF', decimals: 0, name: 'Comorian Franc' },
  KPW: { code: 'KPW', decimals: 2, name: 'North Korean Won' },
  KRW: { code: 'KRW', decimals: 0, name: 'South Korean Won' },
  KWD: { code: 'KWD', decimals: 3, name: 'Kuwaiti Dinar' },
  KYD: { code: 'KYD', decimals: 2, name: 'Cayman Islands Dollar' },
  KZT: { code: 'KZT', decimals: 2, name: 'Kazakhstani Tenge' },
  LAK: { code: 'LAK', decimals: 2, name: 'Lao Kip' },
  LBP: { code: 'LBP', decimals: 2, name: 'Lebanese Pound' },
  LKR: { code: 'LKR', decimals: 2, name: 'Sri Lankan Rupee' },
  LRD: { code: 'LRD', decimals: 2, name: 'Liberian Dollar' },
  LSL: { code: 'LSL', decimals: 2, name: 'Lesotho Loti' },
  LYD: { code: 'LYD', decimals: 3, name: 'Libyan Dinar' },
  MAD: { code: 'MAD', decimals: 2, name: 'Moroccan Dirham' },
  MDL: { code: 'MDL', decimals: 2, name: 'Moldovan Leu' },
  MGA: { code: 'MGA', decimals: 2, name: 'Malagasy Ariary' },
  MKD: { code: 'MKD', decimals: 2, name: 'Macedonian Denar' },
  MMK: { code: 'MMK', decimals: 2, name: 'Myanmar Kyat' },
  MNT: { code: 'MNT', decimals: 2, name: 'Mongolian Tugrik' },
  MOP: { code: 'MOP', decimals: 2, name: 'Macanese Pataca' },
  MRU: { code: 'MRU', decimals: 2, name: 'Mauritanian Ouguiya' },
  MUR: { code: 'MUR', decimals: 2, name: 'Mauritian Rupee' },
  MVR: { code: 'MVR', decimals: 2, name: 'Maldivian Rufiyaa' },
  MWK: { code: 'MWK', decimals: 2, name: 'Malawian Kwacha' },
  MXN: { code: 'MXN', decimals: 2, name: 'Mexican Peso' },
  MYR: { code: 'MYR', decimals: 2, name: 'Malaysian Ringgit' },
  MZN: { code: 'MZN', decimals: 2, name: 'Mozambican Metical' },
  NAD: { code: 'NAD', decimals: 2, name: 'Namibian Dollar' },
  NGN: { code: 'NGN', decimals: 2, name: 'Nigerian Naira' },
  NIO: { code: 'NIO', decimals: 2, name: 'Nicaraguan Cordoba' },
  NOK: { code: 'NOK', decimals: 2, name: 'Norwegian Krone' },
  NPR: { code: 'NPR', decimals: 2, name: 'Nepalese Rupee' },
  NZD: { code: 'NZD', decimals: 2, name: 'New Zealand Dollar' },
  OMR: { code: 'OMR', decimals: 3, name: 'Omani Rial' },
  PAB: { code: 'PAB', decimals: 2, name: 'Panamanian Balboa' },
  PEN: { code: 'PEN', decimals: 2, name: 'Peruvian Sol' },
  PGK: { code: 'PGK', decimals: 2, name: 'Papua New Guinean Kina' },
  PHP: { code: 'PHP', decimals: 2, name: 'Philippine Peso' },
  PKR: { code: 'PKR', decimals: 2, name: 'Pakistani Rupee' },
  PLN: { code: 'PLN', decimals: 2, name: 'Polish Zloty' },
  PYG: { code: 'PYG', decimals: 0, name: 'Paraguayan Guarani' },
  QAR: { code: 'QAR', decimals: 2, name: 'Qatari Riyal' },
  RON: { code: 'RON', decimals: 2, name: 'Romanian Leu' },
  RSD: { code: 'RSD', decimals: 2, name: 'Serbian Dinar' },
  RUB: { code: 'RUB', decimals: 2, name: 'Russian Ruble' },
  RWF: { code: 'RWF', decimals: 0, name: 'Rwandan Franc' },
  SAR: { code: 'SAR', decimals: 2, name: 'Saudi Riyal' },
  SBD: { code: 'SBD', decimals: 2, name: 'Solomon Islands Dollar' },
  SCR: { code: 'SCR', decimals: 2, name: 'Seychellois Rupee' },
  SDG: { code: 'SDG', decimals: 2, name: 'Sudanese Pound' },
  SEK: { code: 'SEK', decimals: 2, name: 'Swedish Krona' },
  SGD: { code: 'SGD', decimals: 2, name: 'Singapore Dollar' },
  SHP: { code: 'SHP', decimals: 2, name: 'Saint Helena Pound' },
  SLE: { code: 'SLE', decimals: 2, name: 'Sierra Leonean Leone' },
  SLL: { code: 'SLL', decimals: 2, name: 'Sierra Leonean Leone (old)' },
  SOS: { code: 'SOS', decimals: 2, name: 'Somali Shilling' },
  SRD: { code: 'SRD', decimals: 2, name: 'Surinamese Dollar' },
  SSP: { code: 'SSP', decimals: 2, name: 'South Sudanese Pound' },
  STN: { code: 'STN', decimals: 2, name: 'Sao Tome and Principe Dobra' },
  SVC: { code: 'SVC', decimals: 2, name: 'Salvadoran Colon' },
  SYP: { code: 'SYP', decimals: 2, name: 'Syrian Pound' },
  SZL: { code: 'SZL', decimals: 2, name: 'Swazi Lilangeni' },
  THB: { code: 'THB', decimals: 2, name: 'Thai Baht' },
  TJS: { code: 'TJS', decimals: 2, name: 'Tajikistani Somoni' },
  TMT: { code: 'TMT', decimals: 2, name: 'Turkmenistani Manat' },
  TND: { code: 'TND', decimals: 3, name: 'Tunisian Dinar' },
  TOP: { code: 'TOP', decimals: 2, name: 'Tongan Paʻanga' },
  TRY: { code: 'TRY', decimals: 2, name: 'Turkish Lira' },
  TTD: { code: 'TTD', decimals: 2, name: 'Trinidad and Tobago Dollar' },
  TWD: { code: 'TWD', decimals: 2, name: 'New Taiwan Dollar' },
  TZS: { code: 'TZS', decimals: 2, name: 'Tanzanian Shilling' },
  UAH: { code: 'UAH', decimals: 2, name: 'Ukrainian Hryvnia' },
  UGX: { code: 'UGX', decimals: 0, name: 'Ugandan Shilling' },
  USD: { code: 'USD', decimals: 2, name: 'US Dollar' },
  UYU: { code: 'UYU', decimals: 2, name: 'Uruguayan Peso' },
  UZS: { code: 'UZS', decimals: 2, name: 'Uzbekistani Som' },
  VES: { code: 'VES', decimals: 2, name: 'Venezuelan Bolivar' },
  VND: { code: 'VND', decimals: 0, name: 'Vietnamese Dong' },
  VUV: { code: 'VUV', decimals: 0, name: 'Vanuatu Vatu' },
  WST: { code: 'WST', decimals: 2, name: 'Samoan Tala' },
  XAF: { code: 'XAF', decimals: 0, name: 'Central African CFA Franc' },
  XCD: { code: 'XCD', decimals: 2, name: 'East Caribbean Dollar' },
  XOF: { code: 'XOF', decimals: 0, name: 'West African CFA Franc' },
  XPF: { code: 'XPF', decimals: 0, name: 'CFP Franc' },
  YER: { code: 'YER', decimals: 2, name: 'Yemeni Rial' },
  ZAR: { code: 'ZAR', decimals: 2, name: 'South African Rand' },
  ZMW: { code: 'ZMW', decimals: 2, name: 'Zambian Kwacha' },
  ZWL: { code: 'ZWL', decimals: 2, name: 'Zimbabwean Dollar' },
});

export function normalizeCurrencyCode(code: string): string {
  if (typeof code !== 'string') {
    throw new InvalidCurrencyCodeError(String(code));
  }
  return code.trim().toUpperCase();
}

export function isSupportedCurrency(code: string): boolean {
  if (typeof code !== 'string') return false;
  const normalized = code.trim().toUpperCase();
  return Boolean(ISO_4217_CURRENCIES[normalized]);
}

export function assertValidCurrencyCode(code: string): string {
  const normalized = normalizeCurrencyCode(code);
  const metadata = ISO_4217_CURRENCIES[normalized];
  if (!metadata) {
    throw new InvalidCurrencyCodeError(normalized);
  }
  return metadata.code;
}

export function getCurrencyFractionDigits(code: string): number {
  const validCode = assertValidCurrencyCode(code);
  return ISO_4217_CURRENCIES[validCode]!.decimals;
}
