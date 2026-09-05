const Organization = require('../models/Organization');
const CrmStage = require('../models/CrmStage');
const CrmLabel = require('../models/CrmLabel');
const CustomField = require('../models/CustomField');
const WorkType = require('../models/WorkType');
const { DEFAULT_WORK_TYPES } = require('../config/defaultWorkTypes');

async function replaceIndex(collection, oldName, keys) {
  let indexes = [];
  try { indexes = await collection.indexes(); } catch (error) { if (error.codeName !== 'NamespaceNotFound') throw error; }
  if (indexes.some(index => index.name === oldName)) {
    await collection.dropIndex(oldName);
  }
  await collection.createIndex(keys, { unique: true });
}

async function ensureCrmIndexes() {
  await replaceIndex(CrmStage.collection, 'organization_1_key_1', { organization: 1, clientCompany: 1, key: 1 });
  await CrmStage.collection.createIndex({ organization: 1, clientCompany: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
  await replaceIndex(CrmLabel.collection, 'organization_1_name_1', { organization: 1, clientCompany: 1, name: 1 });
  await replaceIndex(CustomField.collection, 'organization_1_entity_1_key_1', { organization: 1, clientCompany: 1, entity: 1, key: 1 });
  await replaceIndex(WorkType.collection, 'organization_1_key_1', { organization: 1, clientCompany: 1, key: 1 });
}

const defaultStages = [
  { name: 'New Lead', key: 'new_lead', color: '#2563eb', order: 10, isDefault: true },
  { name: 'Contact Attempted', key: 'contact_attempted', color: '#0891b2', order: 20 },
  { name: 'Contacted', key: 'contacted', color: '#0e7490', order: 30 },
  { name: 'Qualified', key: 'qualified', color: '#7c3aed', order: 40 },
  { name: 'Proposal Sent', key: 'proposal_sent', color: '#d97706', order: 50 },
  { name: 'Negotiation', key: 'negotiation', color: '#db2777', order: 60 },
  { name: 'Nurture / Follow-up', key: 'nurture', color: '#64748b', order: 70 },
  { name: 'Won / Paid', key: 'won', color: '#16a34a', order: 80, isWon: true },
  { name: 'Lost', key: 'lost', color: '#dc2626', order: 90, isLost: true }
];

const defaultLabels = [
  { name: 'HP', color: '#d97706', isHighPotential: true },
  { name: 'Warm', color: '#d97706' },
  { name: 'Cold', color: '#2563eb' },
  { name: 'Retainer', color: '#16a34a' },
  { name: 'One-time Project', color: '#7c3aed' }
];

const defaultFields = [
  { label: 'Service Interested', key: 'service_interested', type: 'select', options: ['Marketing', 'Website', 'SEO', 'Branding', 'Automation'], order: 10 },
  { label: 'Budget Range', key: 'budget_range', type: 'select', options: ['Under 25k', '25k-50k', '50k-1L', '1L+'], order: 20 },
  { label: 'Expected Start Date', key: 'expected_start_date', type: 'date', order: 30 }
];

async function getOrCreateDefaultOrganization() {
  const name = process.env.DEFAULT_ORG_NAME || 'Vande Agency';
  const slug = process.env.DEFAULT_ORG_SLUG || 'vande-agency';
  return Organization.findOneAndUpdate(
    { slug },
    { name, slug },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function ensureCrmDefaults(organizationId, clientCompany, { moduleSetup = 'blank' } = {}) {
  if (!clientCompany) return;
  const [stageCount, labelCount, fieldCount, workTypeCount] = await Promise.all([
    CrmStage.countDocuments({ organization: organizationId, clientCompany }),
    CrmLabel.countDocuments({ organization: organizationId, clientCompany }),
    CustomField.countDocuments({ organization: organizationId, clientCompany }),
    WorkType.countDocuments({ organization: organizationId, clientCompany })
  ]);

  if (stageCount === 0) {
    await CrmStage.insertMany(defaultStages.map(stage => ({ ...stage, organization: organizationId, clientCompany })));
  }

  if (labelCount === 0) {
    await CrmLabel.insertMany(defaultLabels.map(label => ({ ...label, organization: organizationId, clientCompany })));
  }

  if (fieldCount === 0) {
    await CustomField.insertMany(defaultFields.map(field => ({ ...field, organization: organizationId, clientCompany })));
  }
  if (workTypeCount === 0) {
    const keysToInclude = moduleSetup === 'blank'
      ? ['task']
      : ['task', 'meeting', 'video', 'design', 'website', 'content', 'payment'];
    const filteredWorkTypes = DEFAULT_WORK_TYPES.filter(wt => keysToInclude.includes(wt.key));
    await WorkType.insertMany(filteredWorkTypes.map(workType => ({ ...workType, organization: organizationId, clientCompany })));
  }
}

async function syncWorkTypeDefaults() {
  const ClientCompany = require('../models/ClientCompany');
  const desired = new Map(DEFAULT_WORK_TYPES.map(type => [type.key, type]));
  const companies = await ClientCompany.find({ status: { $ne: 'inactive' } }).select('_id organization name');

  for (const company of companies) {
    for (const [key, definition] of desired.entries()) {
      let workType = await WorkType.findOne({
        organization: company.organization,
        clientCompany: company._id,
        key
      });

      if (!workType) {
        await WorkType.create({
          ...definition,
          organization: company.organization,
          clientCompany: company._id
        });
        continue;
      }

      let modified = false;
      const existingFieldKeys = new Set(workType.fields.map(f => f.key));
      const missingFields = definition.fields.filter(f => !existingFieldKeys.has(f.key));
      if (missingFields.length) {
        workType.fields.push(...missingFields);
        modified = true;
      }

      for (const defField of definition.fields) {
        if (defField.options && defField.options.length) {
          const targetField = workType.fields.find(f => f.key === defField.key);
          if (targetField && (!targetField.options || !targetField.options.length)) {
            targetField.options = defField.options;
            modified = true;
          }
        }
      }

      if (definition.presentation) {
        const pres = workType.presentation ? (workType.presentation.toObject ? workType.presentation.toObject() : workType.presentation) : {};
        const defPres = definition.presentation;

        const currentEnabledViews = new Set(pres.enabledViews || ['list', 'board', 'calendar']);
        for (const v of defPres.enabledViews || []) {
          currentEnabledViews.add(v);
        }

        const newPres = {
          ...defPres,
          ...pres,
          enabledViews: Array.from(currentEnabledViews),
          defaultView: pres.defaultView || defPres.defaultView || 'list'
        };

        if (defPres.overviewProgressFields && defPres.overviewProgressFields.length) {
          if (!newPres.overviewProgressFields || !newPres.overviewProgressFields.length) {
            newPres.overviewProgressFields = defPres.overviewProgressFields;
          }
        }
        if (defPres.overviewGroupFields && defPres.overviewGroupFields.length) {
          if (!newPres.overviewGroupFields || !newPres.overviewGroupFields.length) {
            newPres.overviewGroupFields = defPres.overviewGroupFields;
          }
        }
        if (defPres.overviewCompleteValue) {
          newPres.overviewCompleteValue = defPres.overviewCompleteValue;
        }

        workType.presentation = newPres;
        modified = true;
      }

      if (modified) {
        await workType.save();
      }
    }
  }
}

const demoEmails = [
  'aarav.sharma@example.com', 'neha.patel@example.com', 'rohan.das@example.com',
  'priya.mehta@example.com', 'vikram.malhotra@example.com', 'ananya.iyer@example.com',
  'karan.verma@example.com', 'sneha.kapoor@example.com'
];

async function deleteOnboardingData(organizationId, clientCompanyId) {
  const Customer = require('../models/Customer');
  const CustomRecord = require('../models/CustomRecord');

  await Promise.all([
    Customer.deleteMany({
      organization: organizationId,
      clientCompany: clientCompanyId,
      email: { $in: demoEmails }
    }),
    CustomRecord.deleteMany({
      organization: organizationId,
      workspace: clientCompanyId,
      notes: /Seeded agency demonstration/i
    })
  ]);
}

async function seedOnboardingData(organizationId, clientCompanyId) {
  const Customer = require('../models/Customer');
  const CustomRecord = require('../models/CustomRecord');
  const User = require('../models/User');

  const user = await User.findOne({ organization: organizationId, isActive: { $ne: false } }).sort({ createdAt: 1 });
  if (!user) return;

  const [stages, labels, workTypes] = await Promise.all([
    CrmStage.find({ organization: organizationId, clientCompany: clientCompanyId }),
    CrmLabel.find({ organization: organizationId, clientCompany: clientCompanyId }),
    WorkType.find({ organization: organizationId, clientCompany: clientCompanyId })
  ]);

  const stageMap = {};
  for (const s of stages) {
    stageMap[s.key] = s;
  }
  const defaultStage = stages.find(s => s.isDefault) || stages[0];
  const wonStage = stages.find(s => s.isWon) || stages[stages.length - 1];
  const lostStage = stages.find(s => s.isLost) || stages[stages.length - 1];

  const labelMap = {};
  for (const l of labels) {
    labelMap[l.name.toLowerCase()] = l;
  }

  const getStage = key => stageMap[key] || defaultStage;
  const getLabel = name => labelMap[name.toLowerCase()] ? [labelMap[name.toLowerCase()]._id] : [];

  const existingCustomerCount = await Customer.countDocuments({ organization: organizationId, clientCompany: clientCompanyId });
  let createdCustomers = [];

  if (existingCustomerCount === 0) {
    const leadsData = [
      {
        name: 'Aarav Sharma', company: 'Sharma & Sons Tech', email: 'aarav.sharma@example.com',
        phone: '+91 98765 43210', source: 'Google Ads', value: 45000, priority: 'high', leadScore: 85,
        stage: getStage('new_lead')._id, labels: getLabel('HP'),
        customData: { service_interested: 'Website', budget_range: '25k-50k' }
      },
      {
        name: 'Neha Patel', company: 'Patel Consultants', email: 'neha.patel@example.com',
        phone: '+91 98765 12345', source: 'LinkedIn Outreach', value: 85000, priority: 'medium', leadScore: 65,
        stage: getStage('contacted')._id, labels: getLabel('Warm'),
        customData: { service_interested: 'SEO', budget_range: '50k-1L' }
      },
      {
        name: 'Priya Mehta', company: 'Mehta Logistics', email: 'priya.mehta@example.com',
        phone: '+91 98765 33445', source: 'Instagram Ads', value: 60000, priority: 'high', leadScore: 90,
        stage: getStage('proposal_sent')._id, labels: getLabel('HP'),
        customData: { service_interested: 'Branding', budget_range: '50k-1L' }
      },
      {
        name: 'Vikram Malhotra', company: 'Malhotra Retail Group', email: 'vikram.malhotra@example.com',
        phone: '+91 98765 77889', source: 'Website Inquiry', value: 95000, priority: 'high', leadScore: 80,
        stage: getStage('negotiation')._id, labels: getLabel('Warm'),
        customData: { service_interested: 'Marketing', budget_range: '50k-1L' }
      },
      {
        name: 'Rohan Das', company: 'Das Media Works', email: 'rohan.das@example.com',
        phone: '+91 98765 56789', source: 'Direct Referral', value: 120000, priority: 'medium', leadScore: 95,
        stage: wonStage._id, labels: getLabel('Retainer'),
        customData: { service_interested: 'Automation', budget_range: '1L+' }
      },
      {
        name: 'Ananya Iyer', company: 'Iyer Healthtech', email: 'ananya.iyer@example.com',
        phone: '+91 98765 99001', source: 'Referral', value: 150000, priority: 'high', leadScore: 92,
        stage: wonStage._id, labels: getLabel('Retainer'),
        customData: { service_interested: 'Marketing', budget_range: '1L+' }
      },
      {
        name: 'Karan Verma', company: 'Verma Real Estate', email: 'karan.verma@example.com',
        phone: '+91 98765 11223', source: 'Cold Outreach', value: 70000, priority: 'low', leadScore: 40,
        stage: getStage('contact_attempted')._id, labels: getLabel('Cold'),
        customData: { service_interested: 'Website', budget_range: '50k-1L' }
      },
      {
        name: 'Sneha Kapoor', company: 'Kapoor Couture', email: 'sneha.kapoor@example.com',
        phone: '+91 98765 66778', source: 'Meta Ads', value: 110000, priority: 'medium', leadScore: 78,
        stage: getStage('qualified')._id, labels: getLabel('One-time Project'),
        customData: { service_interested: 'Branding', budget_range: '1L+' }
      }
    ];

    createdCustomers = await Customer.insertMany(leadsData.map(lead => ({
      ...lead,
      organization: organizationId,
      clientCompany: clientCompanyId,
      assignedTo: user._id
    })));
  } else {
    createdCustomers = await Customer.find({ organization: organizationId, clientCompany: clientCompanyId }).limit(8);
  }

  const DAY = 86400000;
  const cust = i => createdCustomers[i % Math.max(createdCustomers.length, 1)]?._id;

  const existingRecordCount = await CustomRecord.countDocuments({ organization: organizationId, workspace: clientCompanyId });
  if (existingRecordCount > 0) return;

  const typeMap = {};
  for (const wt of workTypes) {
    typeMap[wt.key] = wt;
  }

  const recordsToInsert = [];

  if (typeMap.video) {
    recordsToInsert.push(
      {
        title: 'Brand Story & Founder Vision Reel',
        module: typeMap.video._id,
        status: 'in_progress',
        priority: 'high',
        customer: cust(0),
        startDate: new Date(Date.now() - 2 * DAY),
        deadline: new Date(Date.now() + 4 * DAY),
        notes: 'Seeded agency demonstration record for video production workflow.',
        customFields: {
          productionLane: 'System A',
          footageLocation: 'Cloud',
          platform: 'Instagram',
          story_cutStatus: 'Done',
          musicStatus: 'Done',
          transitions_zoomsStatus: 'In progress',
          b_rollsStatus: 'Pending',
          finalisationStatus: 'Pending',
          captions_aiStatus: 'Pending',
          scriptLink: 'https://docs.google.com/document/d/demo-script',
          footageLink: 'https://drive.google.com/drive/demo-raw-footage'
        }
      },
      {
        title: 'Customer Case Study & Testimonial Cut',
        module: typeMap.video._id,
        status: 'review',
        priority: 'medium',
        customer: cust(1),
        startDate: new Date(Date.now() - 5 * DAY),
        deadline: new Date(Date.now() + 2 * DAY),
        notes: 'Seeded agency demonstration record for video production workflow.',
        customFields: {
          productionLane: 'System B',
          footageLocation: 'SSD-1',
          platform: 'YouTube',
          story_cutStatus: 'Done',
          musicStatus: 'Done',
          transitions_zoomsStatus: 'Done',
          b_rollsStatus: 'Done',
          finalisationStatus: 'Done',
          captions_aiStatus: 'In progress',
          draftLink: 'https://drive.google.com/file/d/demo-draft'
        }
      },
      {
        title: 'Q3 Product Feature Teaser #1',
        module: typeMap.video._id,
        status: 'delivered',
        priority: 'high',
        customer: cust(2),
        startDate: new Date(Date.now() - 8 * DAY),
        deadline: new Date(Date.now() - 1 * DAY),
        deliveredAt: new Date(),
        notes: 'Seeded agency demonstration record for video production workflow.',
        customFields: {
          productionLane: 'Final system',
          footageLocation: 'Cloud',
          platform: 'Instagram',
          story_cutStatus: 'Done',
          musicStatus: 'Done',
          transitions_zoomsStatus: 'Done',
          b_rollsStatus: 'Done',
          finalisationStatus: 'Done',
          captions_aiStatus: 'Done',
          deliveryLink: 'https://drive.google.com/file/d/demo-final-delivery'
        }
      },
      {
        title: 'Viral Hook Short Form Series #2',
        module: typeMap.video._id,
        status: 'started',
        priority: 'medium',
        customer: cust(3),
        startDate: new Date(),
        deadline: new Date(Date.now() + 6 * DAY),
        notes: 'Seeded agency demonstration record for video production workflow.',
        customFields: {
          productionLane: 'System C',
          footageLocation: 'SSD-2',
          platform: 'Instagram',
          story_cutStatus: 'Done',
          musicStatus: 'Pending',
          transitions_zoomsStatus: 'Pending',
          b_rollsStatus: 'Pending',
          finalisationStatus: 'Pending',
          captions_aiStatus: 'Pending'
        }
      }
    );
  }

  if (typeMap.task) {
    recordsToInsert.push(
      {
        title: 'Schedule discovery call with Aarav',
        module: typeMap.task._id,
        status: 'in_progress',
        priority: 'high',
        customer: cust(0),
        deadline: new Date(Date.now() + 1 * DAY),
        notes: 'Seeded agency demonstration record for tasks.',
        customFields: { taskType: 'Client work' }
      },
      {
        title: 'Prepare creative pitch deck & scope',
        module: typeMap.task._id,
        status: 'started',
        priority: 'high',
        customer: cust(2),
        deadline: new Date(Date.now() + 3 * DAY),
        notes: 'Seeded agency demonstration record for tasks.',
        customFields: { taskType: 'Client work' }
      },
      {
        title: 'Send monthly retainer invoice',
        module: typeMap.task._id,
        status: 'completed',
        priority: 'medium',
        customer: cust(4),
        deadline: new Date(),
        deliveredAt: new Date(),
        notes: 'Seeded agency demonstration record for tasks.',
        customFields: { taskType: 'Payment' }
      }
    );
  }

  if (typeMap.meeting) {
    recordsToInsert.push(
      {
        title: 'Strategy & Discovery Onboarding Call',
        module: typeMap.meeting._id,
        status: 'scheduled',
        priority: 'high',
        customer: cust(0),
        deadline: new Date(Date.now() + 2 * DAY),
        notes: 'Seeded agency demonstration record for meetings.',
        customFields: { referenceLink: 'https://meet.google.com/demo-meet' }
      },
      {
        title: 'Weekly Production & Creative Sync',
        module: typeMap.meeting._id,
        status: 'held',
        priority: 'medium',
        customer: cust(4),
        deadline: new Date(Date.now() - 1 * DAY),
        notes: 'Seeded agency demonstration record for meetings.'
      }
    );
  }

  if (typeMap.design) {
    recordsToInsert.push(
      {
        title: 'Instagram Carousel Pack (5 Slides)',
        module: typeMap.design._id,
        status: 'in_progress',
        priority: 'high',
        customer: cust(2),
        deadline: new Date(Date.now() + 3 * DAY),
        notes: 'Seeded agency demonstration record for designs.',
        customFields: { designType: 'Carousel', draftLink: 'https://figma.com/demo-carousel' }
      },
      {
        title: 'Brand Identity Guidelines & Assets',
        module: typeMap.design._id,
        status: 'delivered',
        priority: 'medium',
        customer: cust(4),
        deadline: new Date(Date.now() - 2 * DAY),
        deliveredAt: new Date(),
        notes: 'Seeded agency demonstration record for designs.',
        customFields: { designType: 'Static Post', deliveryLink: 'https://drive.google.com/demo-brand-pack' }
      }
    );
  }

  if (typeMap.website) {
    recordsToInsert.push(
      {
        title: 'Agency Landing Page Redesign',
        module: typeMap.website._id,
        status: 'development',
        priority: 'high',
        customer: cust(0),
        startDate: new Date(Date.now() - 4 * DAY),
        deadline: new Date(Date.now() + 8 * DAY),
        notes: 'Seeded agency demonstration record for websites.',
        customFields: { pageCount: 5, stagingLink: 'https://staging.example.com' }
      }
    );
  }

  if (typeMap.content) {
    recordsToInsert.push(
      {
        title: 'Founder LinkedIn Thought Leadership Series',
        module: typeMap.content._id,
        status: 'approved',
        priority: 'medium',
        customer: cust(4),
        deadline: new Date(Date.now() + 2 * DAY),
        notes: 'Seeded agency demonstration record for content.',
        customFields: { contentFormat: 'Post', platform: 'LinkedIn', hook: 'Most agencies make this 1 big mistake...' }
      }
    );
  }

  if (typeMap.payment) {
    recordsToInsert.push(
      {
        title: 'August Retainer Invoice',
        module: typeMap.payment._id,
        status: 'paid',
        priority: 'medium',
        customer: cust(4),
        deadline: new Date(),
        notes: 'Seeded agency demonstration record for payments.',
        customFields: { billingMonth: '2026-08', expectedAmount: 85000, paidAmount: 85000, paymentDate: new Date() }
      },
      {
        title: 'September Agency Retainer',
        module: typeMap.payment._id,
        status: 'pending',
        priority: 'high',
        customer: cust(4),
        deadline: new Date(Date.now() + 20 * DAY),
        notes: 'Seeded agency demonstration record for payments.',
        customFields: { billingMonth: '2026-09', expectedAmount: 85000, paidAmount: 0 }
      }
    );
  }

  if (recordsToInsert.length) {
    await CustomRecord.insertMany(recordsToInsert.map(record => ({
      ...record,
      organization: organizationId,
      workspace: clientCompanyId,
      assignedTo: user._id,
      createdBy: user._id
    })));
  }
}

const chatlistLeadsData = [
  { phone: '6375002923', name: 'papurambhati', stage: '1st Call Done', notes: 'amazon ki listing ki sales chahiye' },
  { phone: '8890308700', name: 'Mohit Khatri', stage: '1st Message Done', notes: 'Not Attended' },
  { phone: '9601361365', name: 'Nilkanthjyotish', stage: '1st Message Done' },
  { phone: '9530345689', name: 'Abhishek Sharma', stage: '1st Message Done' },
  { phone: '9819410083', name: 'जय श्री श्याम जय माजीसा', stage: '1st Message Done' },
  { phone: '9001962906', name: 'Deepak Mohnot', stage: 'high Potential', priority: 'high', notes: 'restorent owner foot fall chahiye unko' },
  { phone: '8769529955', name: 'Kaushal Gehlot', stage: '1st Message Done', notes: 'dry fruits, ans spicys business' },
  { phone: '9983102928', name: 'Glow with Nutrition', stage: 'high Potential', priority: 'high', notes: 'Price btaai ye ( 40k+ ads spending )' },
  { phone: '9414467400', name: 'Dr.Kishan Goyal', stage: '1st Message Done' },
  { phone: '6000140004', name: 'Prakash jewellers', stage: '1st Message Done' },
  { phone: '9785069701', name: '5 IGUANAS', stage: '1st Message Done' },
  { phone: '9116397523', name: 'anishh', stage: '1st Message Done' },
  { phone: '9509692361', name: '𝐓𝐀𝐖𝐀𝐊𝐊𝐔𝐋 -تَوَكُّل', stage: 'Untouched' },
  { phone: '9799182000', name: 'Ritesh Kanunga', stage: '1st Message Done' },
  { phone: '9610001846', name: 'Gautam Gandhi', stage: '1st Message Done' },
  { phone: '9099999435', name: 'RAHUL RAJPUROHIT', stage: '1st Message Done' },
  { phone: '9829024197', name: 'Shubham', stage: '1st Message Done' },
  { phone: '9664472144', name: '..', stage: '1st Call Done', notes: 'from jaipur but yahan hi hai business friend ka 20k willing hai testing ke liye online meeting and cilent results chiye' },
  { phone: '9414129348', name: 'Vishal Chouhan', stage: '1st Message Done' },
  { phone: '9462880275', name: 'Shivam Rathi', stage: '1st Message Done' },
  { phone: '7073233100', name: 'Yash', stage: '1st Message Done', notes: 'handycarft factory' },
  { phone: '9509971115', name: 'Manish Kansara', stage: '1st Message Done' },
  { phone: '8696022222', name: "Stylox Men's Wear", stage: '1st Message Done' },
  { phone: '9413788992', name: 'Madhusshree rathi', stage: '1st Message Done' },
  { phone: '9672402423', name: '@ Naruka_Viju', stage: '1st Message Done' },
  { phone: '8890577747', name: 'kishanksuthar5550', stage: '1st Message Done' },
  { phone: '9784334887', name: 'jai gau mata', stage: '1st Message Done' },
  { phone: '9414805004', name: 'Travel To Rajasthan', stage: '1st Message Done' },
  { phone: '9587653500', name: 'Virat Sudan', stage: '1st Message Done' },
  { phone: '9352768049', name: 'Shyam Singh', stage: 'Untouched' },
  { phone: '9413345800', name: 'Fyto Five', stage: '1st Message Done' },
  { phone: '7340559414', name: 'prince mongas', stage: '1st Message Done' },
  { phone: '7611001507', name: 'rajk1616', stage: '1st Message Done' },
  { phone: '7791965977', name: 'Nitesh Prajapati', stage: 'high Potential', priority: 'high' },
  { phone: '7877336679', name: 'shiv Shakti studio', stage: 'Untouched' },
  { phone: '9252066786', name: 'Mohd Afzal', stage: '1st Message Done' },
  { phone: '9148414134', name: 'Sahil Kankariya', stage: '1st Message Done' },
  { phone: '7300306005', name: 'Homelymedic', stage: '1st Message Done' },
  { phone: '8741811000', name: 'parwani nisha', stage: '1st Message Done', notes: 'home se realated he and they want leads so we need to check WA Pe busninss deatils ka bola he Vastu Solutions' },
  { phone: '7023800767', name: '70238 00767', stage: '1st Call Done' },
  { phone: '9106158843', name: 'Jasolika Creation', stage: '1st Call Done', notes: 'Call me 1sep 2026', nextFollowUpAt: new Date('2026-09-01T11:00:00.000Z') },
  { phone: '7073199368', name: 'Ashok Panwar', stage: '1st Message Done', notes: 'busy call again 1 sep at 11 o clock', nextFollowUpAt: new Date('2026-09-01T11:00:00.000Z') },
  { phone: '9928878574', name: 'Rameshwar', stage: '1st Message Done', notes: 'call again at 6:30', nextFollowUpAt: new Date('2026-09-01T13:00:00.000Z') },
  { phone: '9549299355', name: 'Narayan', stage: '1st Call Done', notes: 'Hotle owner need footfall but busy bhi h tho request kr rahe h ki ham mile jake' },
  { phone: '9586655892', name: 'pratab singh', stage: 'high Potential', priority: 'high', notes: 'Handicraft business need sales' },
  { phone: '6367828568', name: 'Mahid', stage: 'high Potential', priority: 'high', notes: 'import export business, new brand launch krni h' },
  { phone: '9414560955', name: '9414560955', stage: 'high Potential', priority: 'high', notes: 'multiple brands ke sath work kr raha h and DM bhi krvali but acha response nhi mila' },
  { phone: '9157499884', name: '9157499884', stage: 'No Answer' }
];

async function backfillChatlistLeads() {
  const Customer = require('../models/Customer');
  const CrmStage = require('../models/CrmStage');
  const CrmLabel = require('../models/CrmLabel');
  const ClientCompany = require('../models/ClientCompany');
  const { slugify } = require('../utils/slug');

  const neededStages = [
    { name: 'Untouched', color: '#64748b', order: 15 },
    { name: '1st Message Done', color: '#7c3aed', order: 25 },
    { name: '1st Call Done', color: '#0891b2', order: 35 },
    { name: 'high Potential', color: '#d97706', order: 45 },
    { name: 'No Answer', color: '#dc2626', order: 55 }
  ];

  const allCustomers = await Customer.find({});
  for (const customer of allCustomers) {
    const custPhone = String(customer.phone || customer.phoneNormalized || '').replace(/\D/g, '').slice(-10);
    const custName = String(customer.name || '').trim().toLowerCase();

    const match = chatlistLeadsData.find(item => {
      const itemDigits = item.phone.replace(/\D/g, '').slice(-10);
      return (itemDigits && custPhone && itemDigits === custPhone) ||
             (custPhone && item.phone.includes(custPhone)) ||
             (item.name && custName && item.name.toLowerCase() === custName);
    });

    if (!match) continue;

    const orgId = customer.organization;
    let companyId = customer.clientCompany;
    if (!companyId) {
      const defaultCompany = await ClientCompany.findOne({ organization: orgId });
      companyId = defaultCompany ? defaultCompany._id : null;
    }

    const stageQuery = { organization: orgId, name: new RegExp('^' + match.stage.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') };
    if (companyId) stageQuery.clientCompany = companyId;
    let stage = await CrmStage.findOne(stageQuery);

    if (!stage) {
      const stageDef = neededStages.find(s => s.name.toLowerCase() === match.stage.toLowerCase()) || { name: match.stage, color: '#0891b2', order: 50 };
      stage = await CrmStage.create({
        organization: orgId,
        clientCompany: companyId,
        name: stageDef.name,
        key: slugify(stageDef.name),
        color: stageDef.color,
        order: stageDef.order,
        isActive: true
      });
    }

    const updateFields = {
      stage: stage._id,
      priority: match.priority || 'medium',
      leadScore: customer.leadScore || 0
    };

    if (companyId && !customer.clientCompany) {
      updateFields.clientCompany = companyId;
    }

    if (match.notes && (!customer.notes || customer.notes.length < match.notes.length)) {
      updateFields.notes = match.notes;
    }

    if (match.stage.toLowerCase().includes('call') || match.stage.toLowerCase().includes('message')) {
      updateFields.lastContactedAt = new Date();
    }

    if (match.nextFollowUpAt) {
      updateFields.nextFollowUpAt = match.nextFollowUpAt;
    }

    await Customer.updateOne({ _id: customer._id }, { $set: updateFields });

    const Activity = require('../models/Activity');
    if (match.stage.toLowerCase().includes('call')) {
      const existingCall = await Activity.findOne({ customer: customer._id, type: 'call' });
      if (!existingCall) {
        await Activity.create({
          organization: orgId,
          customer: customer._id,
          user: customer.assignedTo || null,
          type: 'call',
          note: '1st call completed with lead.' + (match.notes ? ` Notes: ${match.notes}` : ''),
          followUpAction: 'completed',
          comment: match.notes || ''
        });
      }
    } else if (match.stage.toLowerCase().includes('message')) {
      const existingMsg = await Activity.findOne({ customer: customer._id, type: 'whatsapp' });
      if (!existingMsg) {
        await Activity.create({
          organization: orgId,
          customer: customer._id,
          user: customer.assignedTo || null,
          type: 'whatsapp',
          note: '1st message sent to lead.' + (match.notes ? ` Notes: ${match.notes}` : ''),
          followUpAction: 'completed',
          comment: match.notes || ''
        });
      }
    }

    if (match.nextFollowUpAt) {
      const existingScheduled = await Activity.findOne({ customer: customer._id, followUpAction: 'scheduled' });
      if (!existingScheduled) {
        await Activity.create({
          organization: orgId,
          customer: customer._id,
          user: customer.assignedTo || null,
          type: 'task',
          note: 'Follow-up scheduled.',
          nextFollowUpAt: match.nextFollowUpAt,
          followUpAction: 'scheduled',
          comment: match.notes || ''
        });
      }
    }
  }
}

async function syncWorkspaceSeedData() {
  const ClientCompany = require('../models/ClientCompany');
  const Customer = require('../models/Customer');
  const CustomRecord = require('../models/CustomRecord');

  const companies = await ClientCompany.find({ status: { $ne: 'inactive' } }).select('_id organization name');
  for (const company of companies) {
    const [customerCount, recordCount] = await Promise.all([
      Customer.countDocuments({ organization: company.organization, clientCompany: company._id }),
      CustomRecord.countDocuments({ organization: company.organization, workspace: company._id })
    ]);
    if (customerCount === 0 || recordCount === 0) {
      await seedOnboardingData(company.organization, company._id);
    }
  }
  await backfillChatlistLeads();
}

module.exports = {
  getOrCreateDefaultOrganization,
  ensureCrmDefaults,
  ensureCrmIndexes,
  syncWorkTypeDefaults,
  syncWorkspaceSeedData,
  backfillChatlistLeads,
  seedOnboardingData,
  deleteOnboardingData
};
