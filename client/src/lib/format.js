const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export const formatPrice = (value) => currency.format(value);
export const formatCount = (value) => new Intl.NumberFormat('en-IN').format(value);
