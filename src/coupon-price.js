function parseCouponPrice(value, normalPrice) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  const error = () => new Error('Preço com cupom (Pix) inválido. Use vírgula ou ponto, com até duas casas decimais, e informe um valor maior que zero e menor que o preço normal.');
  if (!['string', 'number'].includes(typeof raw) || !/^\d+(?:[.,]\d{1,2})?$/.test(String(raw))) throw error();
  const price = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(normalPrice) || price >= normalPrice) throw error();
  return price;
}
module.exports = { parseCouponPrice };
