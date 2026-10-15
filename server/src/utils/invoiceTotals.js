function invoiceDiscount(invoice) {
  const amount = Number(invoice.amount || 0);
  const discount = Number(invoice.discount || 0);
  if (invoice.discountType !== 'percent') return discount;
  return Math.round((amount * discount / 100 + Number.EPSILON) * 100) / 100;
}

function invoiceTotal(invoice) {
  return Math.max(0, Number(invoice.amount || 0) - invoiceDiscount(invoice));
}

module.exports = { invoiceDiscount, invoiceTotal };
