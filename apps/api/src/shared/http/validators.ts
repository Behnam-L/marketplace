import { registerDecorator, ValidationOptions } from 'class-validator';
import {
  isValidEconomicId,
  isValidHttpsUrl,
  isValidIban,
  isValidLegalNationalId,
  isValidNationalCode,
  normalisePhone,
} from '@bajet/contracts';

function make(name: string, test: (v: unknown) => boolean, message: string) {
  return (options?: ValidationOptions): PropertyDecorator =>
    (object: object, propertyName: string | symbol) =>
      registerDecorator({
        name,
        target: object.constructor,
        propertyName: propertyName as string,
        options: { message, ...options },
        validator: { validate: (v: unknown) => test(v) },
      });
}

const str = (f: (s: string) => boolean) => (v: unknown) => typeof v === 'string' && f(v);

export const IsNationalCode = make('isNationalCode', str(isValidNationalCode), 'Please enter a valid national ID.');
export const IsLegalNationalId = make('isLegalNationalId', str(isValidLegalNationalId), 'Please enter a valid legal-entity national ID.');
export const IsEconomicId = make('isEconomicId', str(isValidEconomicId), 'Economic ID must be 11–12 digits.');
export const IsIban = make('isIban', str(isValidIban), 'Please enter a valid IBAN.');
export const IsIranPhone = make('isIranPhone', str((s) => normalisePhone(s) !== null), 'Please enter a valid mobile number.');
export const IsHttpsUrl = make('isHttpsUrl', str(isValidHttpsUrl), 'Must be an https URL (≤ 2048 characters).');
export const IsMoney = make(
  'isMoney',
  (v) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0,
  'Amount must be a positive integer (Toman).',
);
export const IsBps = make(
  'isBps',
  (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10000,
  'Must be an integer between 0 and 10000 basis points.',
);
