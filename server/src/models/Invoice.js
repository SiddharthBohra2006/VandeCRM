const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['Cash', 'UPI', 'Bank transfer', 'Card', 'Other'], default: 'Other' },
  reference: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  paidAt: { type: Date, default: Date.now }
}, { _id: true });

const installmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  amount: { type: Number, required: true, min: 0.01 },
  dueDate: { type: Date, required: true }
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  invoiceNumber: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true, maxlength: 200 },
  agreementTerms: { type: String, default: '', trim: true, maxlength: 2000 },
  amount: { type: Number, required: true, min: 0.01 },
  discount: { type: Number, default: 0, min: 0 },
  discountType: { type: String, enum: ['amount', 'percent'], default: 'amount' },
  dueDate: { type: Date, default: null },
  installments: { type: [installmentSchema], default: [] },
  monthlyRenewal: { type: Boolean, default: false },
  nextRenewalDate: { type: Date, default: null },
  renewalPromptedMonth: { type: String, default: '' },
  renewalSource: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  renewalPeriod: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  payments: { type: [paymentSchema], default: [] }
}, { timestamps: true });

invoiceSchema.index({ organization: 1, clientCompany: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organization: 1, clientCompany: 1, customer: 1, createdAt: -1 });
module.exports = mongoose.model('Invoice', invoiceSchema);
