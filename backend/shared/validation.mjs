import { fail } from './errors.mjs';

export const integer = (value, label, min = 1, max = 1000) => {
  const number = Number(value);
  fail(!Number.isInteger(number) || number < min || number > max, `${label}: valor inválido`);
  return number;
};

export const text = (value, label, max = 150) => {
  const valueText = String(value ?? '').trim();
  fail(!valueText || valueText.length > max, `${label}: campo obligatorio o demasiado largo`);
  return valueText;
};

export const eventKey = (body) => text(body.evento, 'Identificador de evento', 150);
