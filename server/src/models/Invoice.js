const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['Cash', 'UPI', 'Bank transfer', 'Card', 'Other'], default: 'Other' },
  reference: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  paidAt: { type: Date, default: Date.now }
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  invoiceNumber: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true, maxlength: 200 },
  amount: { type: Number, required: true, min: 0.01 },
  discount: { type: Number, default: 0, min: 0 },
  dueDate: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  payments: { type: [paymentSchema], default: [] }
}, { timestamps: true });

invoiceSchema.index({ organization: 1, clientCompany: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organization: 1, clientCompany: 1, customer: 1, createdAt: -1 });
module.exports = mongoose.model('Invoice', invoiceSchema);
