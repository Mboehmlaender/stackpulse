import crypto from 'crypto';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';

const FALLBACK_SECRET = 'stackpulse-security-phrase-secret';

const WORD_LIST = englishWordlist;


const SECURITY_PHRASE_KEY = crypto
  .createHash('sha256')
  .update(String(process.env.SECURITY_PHRASE_SECRET || FALLBACK_SECRET))
  .digest();

const encryptValue = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SECURITY_PHRASE_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    content: encrypted.toString('base64'),
    tag: tag.toString('base64')
  };
};

const decryptValue = ({ content, iv, tag }) => {
  if (!content || !iv || !tag) {
    return '';
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', SECURITY_PHRASE_KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(content, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
};

export const generateSecurityPhraseWords = (count = 8) => {
  const words = [];
  for (let i = 0; i < count; i += 1) {
    const index = crypto.randomInt(0, WORD_LIST.length);
    words.push(WORD_LIST[index]);
  }
  return words;
};

export const encodeWords = (words = []) => {
  return words
    .map((word) => {
      const index = WORD_LIST.indexOf(word);
      if (index === -1) {
        throw new Error(`SECURITY_PHRASE_WORD_UNKNOWN:${word}`);
      }
      return String(index);
    })
    .join('-');
};

export const decodeWords = (encoded) => {
  if (!encoded) {
    return [];
  }
  return encoded.split('-').map((entry) => {
    const index = Number(entry);
    if (!Number.isFinite(index) || index < 0 || index >= WORD_LIST.length) {
      throw new Error('SECURITY_PHRASE_DECODE_FAILED');
    }
    return WORD_LIST[index];
  });
};

export const encryptSecurityPhrase = (words) => {
  const encoded = encodeWords(words);
  const encrypted = encryptValue(encoded);
  return {
    encrypted,
    encoded
  };
};

export const decryptSecurityPhrase = (record) => {
  if (!record) {
    return [];
  }
  const encoded = decryptValue(record);
  if (!encoded) {
    return [];
  }
  return decodeWords(encoded);
};

export const formatPhraseForDisplay = (words) => {
  const rows = [];
  for (let i = 0; i < words.length; i += 4) {
    rows.push(words.slice(i, i + 4));
  }
  return rows;
};

const normalizeWord = (value) => {
  if (!value && value !== 0) {
    return '';
  }
  return String(value).trim().toLowerCase();
};

export const canonicalizeWords = (words = []) => {
  return words
    .map(normalizeWord)
    .filter((word) => word.length > 0)
    .join('');
};

export const extractWordsFromString = (input) => {
  if (!input && input !== 0) {
    return [];
  }
  const normalized = String(input)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return [];
  }
  return normalized.split(/\s+/).filter(Boolean);
};

export const canonicalizePhraseInput = (input) => {
  if (Array.isArray(input)) {
    return canonicalizeWords(input);
  }
  return canonicalizeWords(extractWordsFromString(input));
};

export default WORD_LIST;
