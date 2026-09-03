// Industry CRM presets applied from /settings/setup.
// Stage entries carry explicit isWon/isLost flags — the same honest shape as
// src/services/defaults.js. The lead/client boundary everywhere in the app is
// "stage.isWon === true", so these flags are decisions, never inferred from
// stage names. Commerce intentionally marks both 'Paid' and 'Delivered' as
// won: a paying customer is a client even before delivery completes.
module.exports = {
  agency: {
    label: 'Agency / services',
    stages: [
      { name: 'Enquiry' },
      { name: 'Discovery call' },
      { name: 'Proposal' },
      { name: 'Negotiation' },
      { name: 'Won', isWon: true },
      { name: 'Lost', isLost: true }
    ],
    labels: ['High value', 'Retainer', 'Website', 'Marketing'],
    fields: [['Service interested', 'select', ['Marketing', 'Website', 'SEO', 'Branding']], ['Budget range', 'select', ['Under 25k', '25k-50k', '50k-1L', '1L+']], ['Expected start date', 'date']]
  },
  sales: {
    label: 'General sales',
    stages: [
      { name: 'New lead' },
      { name: 'Contacted' },
      { name: 'Qualified' },
      { name: 'Demo booked' },
      { name: 'Proposal' },
      { name: 'Won', isWon: true },
      { name: 'Lost', isLost: true }
    ],
    labels: ['HP', 'Follow up', 'Decision maker'],
    fields: [['Product interest', 'text'], ['Budget range', 'text'], ['Next follow-up', 'date']]
  },
  commerce: {
    label: 'Commerce',
    stages: [
      { name: 'New enquiry' },
      { name: 'Product shared' },
      { name: 'Payment pending' },
      { name: 'Paid', isWon: true },
      { name: 'Delivered', isWon: true },
      { name: 'Cancelled', isLost: true }
    ],
    labels: ['Repeat buyer', 'Bulk order', 'COD'],
    fields: [['Product interest', 'text'], ['Order value', 'number'], ['Delivery location', 'text']]
  }
};
