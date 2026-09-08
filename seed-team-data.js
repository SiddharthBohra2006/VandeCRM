/**
 * seed-team-data.js
 * Seeds realistic work records, tasks, activities and leads across
 * the Vande Agency team — Siddharth gets the heaviest workload.
 *
 * Run: node seed-team-data.js
 * Safe to re-run: checks for existing records with the marker tag.
 */

'use strict';
const mongoose = require('mongoose');

// ── IDs pulled from the live DB ────────────────────────────────────────────────
const ORG    = '6a462b142d0febae2422705f'; // Vande Agency
const MAIN   = '6a4f956440bf54de2f6061c3'; // Vande Digital (main workspace)
const ACAD   = '6a46496a5aee1c4ec3711980'; // Vande Digital Academy
const SHOP   = '6a46496a5aee1c4ec3711982'; // Shopify Fashion Store
const NOTES  = '6a4c9ea84d6b9848eb49edb7'; // NotesNinjs

// Users — key team members
const U = {
  admin:    '6a462b14583666a00fbede4f', // Admin
  siddhu:   '6a577334b5812e200f39fa13', // Siddharth Bohra (INTERN) — heavy load
  vivek:    '6a8d373f49363fb49c0f36dc', // Vivek Vyas
  ghanshu:  '6a8d373f49363fb49c0f36e1', // Ghanshu bhai
  bharat:   '6a8d373f49363fb49c0f36e6', // Bharat purohit (video)
  hansraj:  '6a8d373f49363fb49c0f36eb', // Hansraj (video)
  hemant:   '6a8d373f49363fb49c0f36f0', // Hemant Prajapat (video)
  taniya:   '6a8d374049363fb49c0f36f5', // Taniya Saraswat (content)
  zeba:     '6a8d374049363fb49c0f36fa', // Zeba
  himani:   '6a8d374049363fb49c0f3709', // Himani Singh (content)
  rupali:   '6a8d374249363fb49c0f3765', // Rupali (graphic)
  sawai:    '6a8d374149363fb49c0f3728', // Sawai Bhaiya (ads)
  vinit:    '6a8d374149363fb49c0f371d', // Vinit Lakhara (video)
  karan:    '6a8d374049363fb49c0f3713', // Karan sain
};

// WorkTypes on Vande Digital (main)
const WT = {
  tasks:    '6a6357327ad1f74284a74987',
  videos:   '6a6357327ad1f74284a74988',
  designs:  '6a6357327ad1f74284a74986',
  content:  '6a6357327ad1f74284a74985',
  websites: '6a6357327ad1f74284a74989',
  meetings: '6a8bf1e13f9e958e59ccb234',
  payments: '6a8fc78208646651e594e9b1',
};

// WorkTypes on Academy workspace
const WTA = {
  tasks:   '6a6357327ad1f74284a74978',
  videos:  '6a6357327ad1f74284a74979',
  designs: '6a6357327ad1f74284a74977',
  content: '6a6357327ad1f74284a74976',
};

// CRM stages on Vande Digital workspace
const STAGE = {
  newLead:      '6a59386a28c6824e400a332a', // reuse from ACAD – we'll use main ones
};

// Stages on MAIN workspace (Vande Digital)
// (same IDs as queried — let me use Academy ones for customers since main doesn't have its own stage list visible)
// Using Academy stage IDs for customers assigned to ACAD workspace
const STAGE_ACAD = {
  newLead:     '6a59386a28c6824e400a332a',
  contacted:   '6a59386a28c6824e400a332b',
  qualified:   '6a59386a28c6824e400a332c',
  proposal:    '6a59386a28c6824e400a332d',
  negotiation: '6a59386a28c6824e400a332e',
  won:         '6a59386a28c6824e400a332f',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const daysAgo  = n => new Date(Date.now() - n * 864e5);
const daysFrom = n => new Date(Date.now() + n * 864e5);
const pick     = arr => arr[Math.floor(Math.random() * arr.length)];

// ── Model loading ─────────────────────────────────────────────────────────────
function loadModels() {
  require('./server/src/models/Organization');
  require('./server/src/models/ClientCompany');
  require('./server/src/models/WorkType');
  require('./server/src/models/CrmStage');
  require('./server/src/models/CrmLabel');
  const CustomRecord = require('./server/src/models/CustomRecord');
  const Customer     = require('./server/src/models/Customer');
  const Activity     = require('./server/src/models/Activity');
  return { CustomRecord, Customer, Activity };
}

// ── Seed data definitions ─────────────────────────────────────────────────────

function taskRecords() {
  // Siddharth gets 18 tasks, others share the rest
  return [
    // ── Siddharth — heavy pile ──────────────────────────────────────────────
    { title: 'Redesign Vande Digital homepage hero section',        status: 'in_progress', assignedTo: U.siddhu, priority: 'high',   module: WT.websites, workspace: MAIN, deadline: daysFrom(3),  notes: 'Use new brand colors. Mobile-first approach. Check Figma file for reference.' },
    { title: 'Fix contact form validation on client landing page',  status: 'started',     assignedTo: U.siddhu, priority: 'high',   module: WT.websites, workspace: MAIN, deadline: daysFrom(1),  notes: 'Email field not validating correctly on Safari.' },
    { title: 'Build CRM lead import CSV parser',                    status: 'in_progress', assignedTo: U.siddhu, priority: 'high',   module: WT.tasks,    workspace: MAIN, deadline: daysFrom(4),  notes: 'Parse, deduplicate, and insert. Edge cases: blank rows, duplicate emails.' },
    { title: 'SEO audit — Vande Academy blog pages',                status: 'review',      assignedTo: U.siddhu, priority: 'medium', module: WT.tasks,    workspace: ACAD, deadline: daysFrom(2),  notes: 'Run Screaming Frog. Export broken links report.' },
    { title: 'Integrate Google Analytics 4 on all client sites',    status: 'in_progress', assignedTo: U.siddhu, priority: 'high',   module: WT.websites, workspace: MAIN, deadline: daysFrom(5),  notes: 'Also set up conversion events for form submit and call-click.' },
    { title: 'Set up WhatsApp Business API for Shopify client',     status: 'pending',     assignedTo: U.siddhu, priority: 'high',   module: WT.tasks,    workspace: SHOP, deadline: daysFrom(6),  notes: 'Use official Meta Business Suite. Catalog sync required.' },
    { title: 'Write technical documentation for CRM API endpoints', status: 'in_progress', assignedTo: U.siddhu, priority: 'medium', module: WT.content,  workspace: MAIN, deadline: daysFrom(8),  notes: 'Swagger format. Cover auth, customers, work endpoints.' },
    { title: 'Debug dashboard metrics not loading for some users',   status: 'started',     assignedTo: U.siddhu, priority: 'high',   module: WT.tasks,    workspace: MAIN, deadline: daysAgo(1),   notes: 'Reproduce on incognito. Likely a permission guard issue.' },
    { title: 'Optimize DB queries — slow leads list (3s+ load)',    status: 'in_progress', assignedTo: U.siddhu, priority: 'high',   module: WT.tasks,    workspace: MAIN, deadline: daysFrom(2),  notes: 'Add compound index on (org, clientCompany, stage). Check explain().' },
    { title: 'Add dark mode support to client reporting portal',    status: 'pending',     assignedTo: U.siddhu, priority: 'medium', module: WT.websites, workspace: MAIN, deadline: daysFrom(10), notes: 'Use prefers-color-scheme + CSS vars.' },
    { title: 'Migrate Shopify store images to CDN',                 status: 'in_progress', assignedTo: U.siddhu, priority: 'medium', module: WT.tasks,    workspace: SHOP, deadline: daysFrom(4),  notes: 'Cloudflare R2. Update all product image URLs via API.' },
    { title: 'Set up automated email drip campaign — Academy',      status: 'pending',     assignedTo: U.siddhu, priority: 'high',   module: WT.tasks,    workspace: ACAD, deadline: daysFrom(7),  notes: 'Use Mailchimp. 5-email sequence for new course enrollments.' },
    { title: 'Create performance report — Q3 2026 all clients',    status: 'review',      assignedTo: U.siddhu, priority: 'medium', module: WT.content,  workspace: MAIN, deadline: daysFrom(1),  notes: 'Slide deck + PDF. Include ad spend, leads, ROAS per client.' },
    { title: 'Pixel tracking audit — all Meta ad accounts',        status: 'completed',   assignedTo: U.siddhu, priority: 'medium', module: WT.tasks,    workspace: MAIN, deadline: daysAgo(2),   notes: 'Done. Events verified firing correctly across all 4 clients.', deliveredAt: daysAgo(1) },
    { title: 'NotesNinjs — landing page A/B test setup',           status: 'started',     assignedTo: U.siddhu, priority: 'medium', module: WT.websites, workspace: NOTES, deadline: daysFrom(5), notes: 'Two variants: headline A vs B. Use VWO for split testing.' },
    { title: 'Build team dashboard — workload view',               status: 'in_progress', assignedTo: U.siddhu, priority: 'high',   module: WT.tasks,    workspace: MAIN, deadline: daysFrom(3),  notes: 'Show tasks per person, completion rate, overdue count.' },
    { title: 'Configure Cloudflare DNS for new client domain',      status: 'completed',   assignedTo: U.siddhu, priority: 'low',    module: WT.tasks,    workspace: MAIN, deadline: daysAgo(3),   deliveredAt: daysAgo(3) },
    { title: 'Backend: Add bulk-assign endpoint for leads',         status: 'pending',     assignedTo: U.siddhu, priority: 'high',   module: WT.tasks,    workspace: MAIN, deadline: daysFrom(6),  notes: 'POST /api/customers/bulk-assign. Validate user is in same org.' },

    // ── Vivek Vyas ───────────────────────────────────────────────────────────
    { title: 'Follow up with Academy lead — Rohan Mehta',          status: 'started',     assignedTo: U.vivek,  priority: 'high',   module: WT.tasks,    workspace: ACAD, deadline: daysFrom(1),  notes: 'Called twice. Sent WhatsApp. Try evening call today.' },
    { title: 'Prepare proposal for Shopify store expansion',       status: 'in_progress', assignedTo: U.vivek,  priority: 'high',   module: WT.tasks,    workspace: SHOP, deadline: daysFrom(3),  notes: 'Include ad budget projection and ROI estimate.' },
    { title: 'Client onboarding call — new fashion brand',        status: 'completed',   assignedTo: U.vivek,  priority: 'medium', module: WT.meetings, workspace: MAIN, deadline: daysAgo(1),   deliveredAt: daysAgo(1) },
    { title: 'Lead qualification — inbound Academy inquiries',     status: 'in_progress', assignedTo: U.vivek,  priority: 'medium', module: WT.tasks,    workspace: ACAD, deadline: daysFrom(2), },

    // ── Ghanshu bhai ─────────────────────────────────────────────────────────
    { title: 'Call back warm leads from Meta ad campaign',         status: 'in_progress', assignedTo: U.ghanshu, priority: 'high',  module: WT.tasks,    workspace: ACAD, deadline: daysFrom(1),  notes: '12 leads from yesterday. Priority: budget above 50k.' },
    { title: 'Update CRM pipeline — move stale leads to nurture',  status: 'pending',     assignedTo: U.ghanshu, priority: 'medium',module: WT.tasks,    workspace: MAIN, deadline: daysFrom(2), },

    // ── Bharat — video ───────────────────────────────────────────────────────
    { title: 'Edit brand story reel — Shopify client',             status: 'in_progress', assignedTo: U.bharat, priority: 'high',   module: WT.videos,   workspace: SHOP, deadline: daysFrom(2),  notes: '60s reel. Add subtitles, color grade, brand music.' },
    { title: 'Cut testimonial video — Academy student',            status: 'review',      assignedTo: U.bharat, priority: 'medium', module: WT.videos,   workspace: ACAD, deadline: daysFrom(1), },
    { title: 'Long-form video edit — Vande Digital explainer',     status: 'started',     assignedTo: U.bharat, priority: 'medium', module: WT.videos,   workspace: MAIN, deadline: daysFrom(4), },

    // ── Hansraj — video ──────────────────────────────────────────────────────
    { title: 'Shoot product demo — NotesNinjs app walkthrough',    status: 'pending',     assignedTo: U.hansraj, priority: 'high',  module: WT.videos,   workspace: NOTES, deadline: daysFrom(3), notes: 'Screen recording + voiceover. 3-min max.' },
    { title: 'Instagram reels batch — 4 videos for Academy',       status: 'in_progress', assignedTo: U.hansraj, priority: 'medium',module: WT.videos,   workspace: ACAD, deadline: daysFrom(5), },

    // ── Hemant — video ───────────────────────────────────────────────────────
    { title: 'Colour grade all October reels — Shopify',           status: 'started',     assignedTo: U.hemant, priority: 'medium', module: WT.videos,   workspace: SHOP, deadline: daysFrom(3), },
    { title: 'Render final exports — Q3 client video package',     status: 'completed',   assignedTo: U.hemant, priority: 'low',    module: WT.videos,   workspace: MAIN, deadline: daysAgo(2),  deliveredAt: daysAgo(2) },

    // ── Taniya — content ─────────────────────────────────────────────────────
    { title: 'Write 4 blog posts — Academy digital marketing course', status: 'in_progress', assignedTo: U.taniya, priority: 'high', module: WT.content, workspace: ACAD, deadline: daysFrom(5), notes: 'Target keyword per post. 800+ words. SEO-optimized.' },
    { title: 'Social captions — Shopify October collection launch', status: 'review',     assignedTo: U.taniya, priority: 'high',   module: WT.content,  workspace: SHOP, deadline: daysFrom(1), },
    { title: 'Email newsletter — Vande Digital monthly update',    status: 'pending',     assignedTo: U.taniya, priority: 'medium', module: WT.content,  workspace: MAIN, deadline: daysFrom(6), },

    // ── Rupali — design ──────────────────────────────────────────────────────
    { title: 'Design Instagram carousel — 10 slides Shopify',     status: 'in_progress', assignedTo: U.rupali, priority: 'high',   module: WT.designs,  workspace: SHOP, deadline: daysFrom(2), },
    { title: 'Create logo variants — NotesNinjs rebrand',         status: 'review',      assignedTo: U.rupali, priority: 'high',   module: WT.designs,  workspace: NOTES, deadline: daysFrom(1), notes: '3 options. Dark, light, and icon-only.' },
    { title: 'Design pitch deck — new client proposal template',   status: 'started',     assignedTo: U.rupali, priority: 'medium', module: WT.designs,  workspace: MAIN, deadline: daysFrom(7), },

    // ── Sawai — ads ──────────────────────────────────────────────────────────
    { title: 'Launch Meta ad campaign — Academy Oct batch',        status: 'in_progress', assignedTo: U.sawai,  priority: 'high',   module: WT.tasks,    workspace: ACAD, deadline: daysFrom(1),  notes: 'Budget: ₹50,000. Target: 18-35, interests: digital marketing.' },
    { title: 'Optimize Shopify ad sets — reduce CPL',             status: 'review',      assignedTo: U.sawai,  priority: 'high',   module: WT.tasks,    workspace: SHOP, deadline: daysFrom(2),  notes: 'CPL is ₹420, target ₹280. Pause underperforming ad sets.' },

    // ── Vinit — video ────────────────────────────────────────────────────────
    { title: 'Motion graphics intro — Academy course promo',       status: 'in_progress', assignedTo: U.vinit,  priority: 'medium', module: WT.videos,   workspace: ACAD, deadline: daysFrom(4), },

    // ── Himani — content ─────────────────────────────────────────────────────
    { title: 'Write copy for Shopify product descriptions — 20 SKUs', status: 'in_progress', assignedTo: U.himani, priority: 'medium', module: WT.content, workspace: SHOP, deadline: daysFrom(4), },
    { title: 'LinkedIn posts — Vande Digital thought leadership',  status: 'pending',     assignedTo: U.himani, priority: 'low',    module: WT.content,  workspace: MAIN, deadline: daysFrom(8), },
  ];
}

function meetingRecords() {
  return [
    { title: 'Sprint planning — Siddharth + Admin',    status: 'scheduled', assignedTo: U.siddhu,  module: WT.meetings, workspace: MAIN, deadline: daysFrom(1),  notes: 'Review all in-progress tasks. Prioritise for the week.' },
    { title: 'Client review call — NotesNinjs',        status: 'held',      assignedTo: U.siddhu,  module: WT.meetings, workspace: NOTES, deadline: daysAgo(2), notes: 'Presented landing page design. Client approved with minor tweaks.', deliveredAt: daysAgo(2) },
    { title: 'Shopify Q4 strategy — Vivek + Sawai',   status: 'scheduled', assignedTo: U.vivek,   module: WT.meetings, workspace: SHOP, deadline: daysFrom(2), },
    { title: 'Academy batch kickoff — Ghanshu',        status: 'held',      assignedTo: U.ghanshu, module: WT.meetings, workspace: ACAD, deadline: daysAgo(1),  deliveredAt: daysAgo(1) },
    { title: 'Design review — Rupali + Siddharth',    status: 'scheduled', assignedTo: U.rupali,  module: WT.meetings, workspace: MAIN, deadline: daysFrom(1),  notes: 'Review homepage mockup. Siddharth to give dev feedback.' },
    { title: 'Ad performance review — Sawai + Admin', status: 'held',      assignedTo: U.sawai,   module: WT.meetings, workspace: MAIN, deadline: daysAgo(3),  deliveredAt: daysAgo(3) },
  ];
}

function customers() {
  // Leads for the Academy workspace — mix of assignees, Siddharth has a few
  return [
    { name: 'Arjun Sharma',       company: 'Freelancer',         email: 'arjun@email.com',   phone: '9876543201', value: 45000,  priority: 'high',   assignedTo: U.siddhu,  stage: STAGE_ACAD.newLead,     workspace: ACAD, source: 'Meta Ads' },
    { name: 'Priya Kapoor',       company: 'Kapoor Boutique',    email: 'priya@kapoor.in',   phone: '9876543202', value: 120000, priority: 'high',   assignedTo: U.vivek,   stage: STAGE_ACAD.proposal,    workspace: ACAD, source: 'Referral' },
    { name: 'Rohan Mehta',        company: 'Mehta Exports',      email: 'rohan@mehta.com',   phone: '9876543203', value: 85000,  priority: 'high',   assignedTo: U.vivek,   stage: STAGE_ACAD.contacted,   workspace: ACAD, source: 'Instagram' },
    { name: 'Sneha Patel',        company: 'SP Enterprises',     email: 'sneha@sp.in',       phone: '9876543204', value: 35000,  priority: 'medium', assignedTo: U.ghanshu, stage: STAGE_ACAD.newLead,     workspace: ACAD, source: 'Meta Ads' },
    { name: 'Vikram Singh',       company: 'VikiTech',           email: 'vikram@vikitech.io',phone: '9876543205', value: 200000, priority: 'high',   assignedTo: U.siddhu,  stage: STAGE_ACAD.negotiation, workspace: ACAD, source: 'Website', nextFollowUpAt: daysFrom(2) },
    { name: 'Anita Joshi',        company: 'Anita Creations',    email: 'anita@creations.in',phone: '9876543206', value: 60000,  priority: 'medium', assignedTo: U.zeba,    stage: STAGE_ACAD.qualified,   workspace: ACAD, source: 'Meta Ads' },
    { name: 'Mohit Agarwal',      company: 'Agarwal & Sons',     email: 'mohit@agarwal.com', phone: '9876543207', value: 150000, priority: 'high',   assignedTo: U.vivek,   stage: STAGE_ACAD.won,         workspace: ACAD, source: 'Referral' },
    { name: 'Kavita Rao',         company: 'Rao Real Estate',    email: 'kavita@rao.in',     phone: '9876543208', value: 75000,  priority: 'medium', assignedTo: U.ghanshu, stage: STAGE_ACAD.contacted,   workspace: ACAD, source: 'Google' },
    { name: 'Rahul Desai',        company: 'Desai Pharma',       email: 'rahul@desai.in',    phone: '9876543209', value: 280000, priority: 'high',   assignedTo: U.siddhu,  stage: STAGE_ACAD.proposal,    workspace: ACAD, source: 'Website', nextFollowUpAt: daysFrom(1) },
    { name: 'Nisha Sharma',       company: 'Nisha Lifestyle',    email: 'nisha@lifestyle.in',phone: '9876543210', value: 40000,  priority: 'low',    assignedTo: U.karan,   stage: STAGE_ACAD.newLead,     workspace: ACAD, source: 'Meta Ads' },
    { name: 'Deepak Malhotra',    company: 'DM Logistics',       email: 'deepak@dm.in',      phone: '9876543211', value: 320000, priority: 'high',   assignedTo: U.siddhu,  stage: STAGE_ACAD.negotiation, workspace: ACAD, source: 'Referral', nextFollowUpAt: daysFrom(3) },
    { name: 'Sunita Bhatt',       company: 'Bhatt Foods',        email: 'sunita@bhatt.in',   phone: '9876543212', value: 55000,  priority: 'medium', assignedTo: U.ghanshu, stage: STAGE_ACAD.contacted,   workspace: ACAD, source: 'WhatsApp' },
    { name: 'Ajay Verma',         company: 'Verma Industries',   email: 'ajay@verma.in',     phone: '9876543213', value: 180000, priority: 'high',   assignedTo: U.vivek,   stage: STAGE_ACAD.qualified,   workspace: ACAD, source: 'Meta Ads' },
    { name: 'Meena Gupta',        company: 'Gupta Jewellers',    email: 'meena@gupta.in',    phone: '9876543214', value: 90000,  priority: 'medium', assignedTo: U.zeba,    stage: STAGE_ACAD.proposal,    workspace: ACAD, source: 'Instagram' },
    { name: 'Suresh Nair',        company: 'Nair Consultants',   email: 'suresh@nair.in',    phone: '9876543215', value: 130000, priority: 'high',   assignedTo: U.siddhu,  stage: STAGE_ACAD.contacted,   workspace: ACAD, source: 'Referral', nextFollowUpAt: daysFrom(1) },
  ];
}

function activities(customerIdMap) {
  // Return activity logs for various customers
  const items = [];
  const names = Object.keys(customerIdMap);

  const pushAct = (customerKey, type, user, note, daysBack, followUp) => {
    const cid = customerIdMap[customerKey];
    if (!cid) return;
    items.push({
      organization: ORG, customer: cid, user, type, note,
      nextFollowUpAt: followUp || null,
      createdAt: daysAgo(daysBack),
      updatedAt: daysAgo(daysBack),
    });
  };

  // Siddharth's lead — Vikram Singh
  pushAct('vikram', 'call',     U.siddhu, 'Connected. Discussed 3-month digital package. Very interested. Budget confirmed at ₹2L. Sending proposal tomorrow.', 3, daysFrom(2));
  pushAct('vikram', 'whatsapp', U.siddhu, 'Sent proposal deck on WhatsApp. He said he will review with his partner.', 2, daysFrom(2));
  pushAct('vikram', 'note',     U.siddhu, 'Follow-up reminder set. Decision expected by weekend.', 1);

  // Rahul Desai — Siddharth
  pushAct('rahul',  'meeting',  U.siddhu, 'Video call meeting held. Walked through SEO + social media + website plan. Very positive. Timeline agreed: start next week.', 2, daysFrom(1));
  pushAct('rahul',  'call',     U.siddhu, 'Confirmation call. He wants to include reels production. Updating proposal.', 1, daysFrom(1));

  // Deepak Malhotra — Siddharth
  pushAct('deepak', 'email',    U.siddhu, 'Sent revised proposal with logistics-specific content plan.', 2, daysFrom(3));
  pushAct('deepak', 'call',     U.siddhu, 'Long call — he is comparing us with one other agency. Shared client testimonials.', 1, daysFrom(3));

  // Suresh Nair — Siddharth
  pushAct('suresh', 'whatsapp', U.siddhu, 'Initial outreach. He responded positively. Scheduled callback for tomorrow.', 1, daysFrom(1));

  // Arjun — Siddharth
  pushAct('arjun',  'call',     U.siddhu, 'Introductory call done. Interested in social media management. Budget ₹25–45k/month.', 4);
  pushAct('arjun',  'note',     U.siddhu, 'Send portfolio links and case study for retail client.', 3, daysFrom(2));

  // Rohan — Vivek
  pushAct('rohan',  'call',     U.vivek,  'Called. No answer. Left voicemail.', 2);
  pushAct('rohan',  'whatsapp', U.vivek,  'Sent WhatsApp intro message with brochure.', 1, daysFrom(1));

  // Priya — Vivek
  pushAct('priya',  'meeting',  U.vivek,  'Zoom call done. She runs a boutique and wants Instagram + ads. Proposal being prepared.', 3, daysFrom(2));
  pushAct('priya',  'email',    U.vivek,  'Proposal sent via email. Awaiting response.', 2);

  // Mohit — Vivek (won)
  pushAct('mohit',  'call',     U.vivek,  'Deal closed! ₹1.5L/month. Starting 1 Oct.', 5);
  pushAct('mohit',  'note',     U.admin,  'Onboarding call scheduled. Siddharth to set up GA4 and pixel.', 4);

  // Sneha — Ghanshu
  pushAct('sneha',  'call',     U.ghanshu,'First contact. She runs a garment export business. Interested in lead generation ads.', 3);
  pushAct('sneha',  'whatsapp', U.ghanshu,'Sent brochure and pricing.', 2, daysFrom(3));

  // Kavita — Ghanshu
  pushAct('kavita', 'call',     U.ghanshu,'Connected. Real estate — wants YouTube + Instagram. Budget is tight ₹15k/month.', 4);
  pushAct('kavita', 'note',     U.ghanshu,'Discuss bundled package options.', 3, daysFrom(2));

  // Ajay — Vivek
  pushAct('ajay',   'meeting',  U.vivek,  'Discovery call done. Manufacturing business. Needs LinkedIn B2B content + ads.', 2, daysFrom(3));

  return items;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect('mongodb://127.0.0.1:27017/vande-agency-crm');
  console.log('Connected.\n');

  const { CustomRecord, Customer, Activity } = loadModels();

  // Guard: skip if seed marker record exists
  const marker = await CustomRecord.findOne({ title: '[SEED] team-data-v1', organization: ORG }).lean();
  if (marker) {
    console.log('Seed already applied (marker found). Skipping.\nDelete the "[SEED] team-data-v1" task record to re-seed.');
    await mongoose.disconnect();
    return;
  }

  // ── Insert Customers (Leads) ───────────────────────────────────────────────
  console.log('Inserting leads/customers...');
  const customerDefs = customers();
  const customerIdMap = {};

  for (const c of customerDefs) {
    const existing = await Customer.findOne({ organization: ORG, email: c.email }).lean();
    if (existing) {
      customerIdMap[c.name.split(' ')[0].toLowerCase()] = existing._id;
      console.log(`  skip existing: ${c.name}`);
      continue;
    }
    const doc = await Customer.create({
      organization: ORG,
      name: c.name, company: c.company, email: c.email,
      phone: c.phone, source: c.source, value: c.value,
      priority: c.priority, assignedTo: c.assignedTo,
      stage: c.stage, clientCompany: c.workspace,
      nextFollowUpAt: c.nextFollowUpAt || null,
      leadScore: Math.floor(Math.random() * 40) + 40,
      notes: `Seeded lead — ${c.source}`,
    });
    customerIdMap[c.name.split(' ')[0].toLowerCase()] = doc._id;
    console.log(`  + ${c.name}`);
  }

  // ── Insert Activities ──────────────────────────────────────────────────────
  console.log('\nInserting activity logs...');
  const acts = activities(customerIdMap);
  for (const a of acts) {
    if (!a.customer) continue;
    await Activity.create(a);
  }
  console.log(`  ${acts.length} activities inserted.`);

  // ── Insert Work Records + Meetings ─────────────────────────────────────────
  console.log('\nInserting work records...');
  const allRecords = [...taskRecords(), ...meetingRecords()];

  for (const r of allRecords) {
    const rec = await CustomRecord.create({
      organization: ORG,
      workspace:    r.workspace,
      module:       r.module,
      title:        r.title,
      status:       r.status,
      assignedTo:   r.assignedTo,
      priority:     r.priority || 'medium',
      deadline:     r.deadline || null,
      deliveredAt:  r.deliveredAt || null,
      notes:        r.notes || '',
      createdBy:    U.admin,
      workflowHistory: [{
        event:  'created',
        actor:  U.admin,
        toUser: r.assignedTo,
        toStatus: r.status,
        at: daysAgo(Math.floor(Math.random() * 10) + 1),
      }],
    });
    const assigneeName = Object.entries(U).find(([,v]) => v === r.assignedTo)?.[0] || '?';
    console.log(`  + [${assigneeName.padEnd(8)}] ${r.title.substring(0, 60)}`);
  }

  // ── Seed marker ────────────────────────────────────────────────────────────
  await CustomRecord.create({
    organization: ORG, workspace: MAIN, module: WT.tasks,
    title: '[SEED] team-data-v1', status: 'completed',
    assignedTo: U.admin, priority: 'low', createdBy: U.admin,
    notes: 'Seed marker — do not delete unless you want to re-run seeding.',
    workflowHistory: [{ event: 'created', actor: U.admin, toStatus: 'completed', at: new Date() }],
  });

  console.log('\n✅ Seeding complete!');
  console.log(`   ${allRecords.length} work records`);
  console.log(`   ${customerDefs.length} leads/customers`);
  console.log(`   ${acts.length} activity logs`);
  console.log('\nSiddharth Bohra has been assigned the heaviest workload (18 tasks).');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
