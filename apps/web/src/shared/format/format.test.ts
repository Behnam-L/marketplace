import { bpsToPercent, mmss, parseAmount, percentToBps, toman } from './format';

describe('format', () => {
  it('formats Toman with Persian digits and separators', () => {
    expect(toman(20000000)).toBe('۲۰٬۰۰۰٬۰۰۰ تومان');
    expect(toman(null)).toBe('—');
  });
  it('parses amounts in Persian or ASCII digits', () => {
    expect(parseAmount('۱۲٬۰۰۰')).toBe(12000);
    expect(parseAmount('12,500')).toBe(12500);
    expect(parseAmount('12.5')).toBeNull();
  });
  it('converts percent ↔ bps with up to 2 decimals', () => {
    expect(percentToBps('2.5')).toBe(250);
    expect(percentToBps('۱۰۰')).toBe(10000);
    expect(percentToBps('1.234')).toBeNull();
    expect(bpsToPercent(2500)).toBe('۲۵٪');
  });
  it('renders countdowns', () => {
    expect(mmss(125)).toBe('۰۲:۰۵');
  });
});
