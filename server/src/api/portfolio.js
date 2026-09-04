const express = require('express');
const ClientCompany = require('../models/ClientCompany');
const Campaign = require('../models/Campaign');
const Customer = require('../models/Customer');
const CustomRecord = require('../models/CustomRecord');
const WorkType = require('../models/WorkType');
const { requireApiAuth } = require('./middleware/auth');
const { isClosed } = require('../utils/workCompletion');

const router = express.Router();
router.use(requireApiAuth);

const isOpenWork = item => !isClosed(item) && item.status !== 'on_hold';

// GET /api/portfolio — All CRMs overview (admin + main CRM required)
router.get('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Main CRM access required' });

    const activeCompany = await ClientCompany.findOne({
      _id: req.activeCompanyId,
      organization: req.user.organization._id,
    });
    if (!activeCompany?.isMain) return res.status(403).json({ ok: false, error: 'Main CRM access required' });

    const organization = req.user.organization._id;
    const requestedDetail = String(req.query.detail || '');
    const detail = ['leads', 'work'].includes(requestedDetail) || /^[a-f0-9]{24}$/i.test(requestedDetail) ? requestedDetail : '';

    const companies = await ClientCompany.find({ organization, status: { $ne: 'inactive' } }).sort({ isMain: -1, name: 1 });
    const companyIds = companies.map(company => company._id);
    const [leadGroups, workItems, workTypes, campaigns, detailLeads] = await Promise.all([
      Customer.aggregate([
        { $match: { organization, clientCompany: { $in: companyIds } } },
        { $group: { _id: '$clientCompany', count: { $sum: 1 }, value: { $sum: '$value' } } }
      ]),
      CustomRecord.find({ organization, workspace: { $in: companyIds } }).populate('clientCompany workType').sort({ updatedAt: -1 }),
      WorkType.find({ organization, clientCompany: { $in: companyIds }, isActive: true }).populate('clientCompany').sort({ order: 1, name: 1 }),
      Campaign.find({ organization, clientCompany: { $in: companyIds } }),
      detail === 'leads'
        ? Customer.find({ organization, clientCompany: { $in: companyIds } }).populate('clientCompany stage').sort({ updatedAt: -1 }).limit(100)
        : []
    ]);

    const leadMap = new Map(leadGroups.map(row => [String(row._id), row]));
    const perCrm = companies.map(company => {
      const companyWork = workItems.filter(item => String(item.clientCompany?._id) === String(company._id));
      const companyCampaigns = campaigns.filter(item => String(item.clientCompany) === String(company._id));
      const leads = leadMap.get(String(company._id)) || { count: 0, value: 0 };
      return {
        company: {
          _id: company._id,
          name: company.name,
          isMain: company.isMain,
          businessType: company.businessType || 'service',
          category: company.category,
          status: company.status,
        },
        leads: leads.count,
        value: leads.value,
        openWork: companyWork.filter(isOpenWork).length,
        moduleCounts: workTypes
          .filter(type => String(type.clientCompany?._id) === String(company._id))
          .map(type => ({ name: type.name, count: companyWork.filter(item => String(item.workType?._id) === String(type._id)).length })),
        adSpend: companyCampaigns.reduce((sum, item) => sum + Number(item.spent || 0), 0)
      };
    });

    const visibleWork = detail === 'work'
      ? workItems.filter(isOpenWork).slice(0, 100)
      : detail && detail !== 'leads' ? workItems.filter(item => String(item.workType?._id) === detail).slice(0, 100) : [];

    const workLibrary = workTypes
      .map(workType => ({
        _id: workType._id,
        name: workType.name,
        company: workType.clientCompany?.name || '',
        count: workItems.filter(item => String(item.workType?._id) === String(workType._id) && isOpenWork(item)).length
      }))
      .filter(item => item.count > 0);

    res.json({
      ok: true,
      companies,
      perCrm,
      detail,
      detailLeads,
      visibleWork,
      workLibrary,
      mainCompanyName: companies.find(company => company.isMain)?.name || 'Not selected',
      totals: {
        crms: companies.length,
        leads: perCrm.reduce((sum, item) => sum + item.leads, 0),
        value: perCrm.reduce((sum, item) => sum + item.value, 0),
        openWork: perCrm.reduce((sum, item) => sum + item.openWork, 0)
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
