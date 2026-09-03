const express = require('express');
const { requireApiAuth } = require('./middleware/auth');
const Notification = require('../models/Notification');

const router = express.Router();
router.use(requireApiAuth);

// GET /api/notifications/feed — Unread count and recent notifications
router.get('/feed', async (req, res, next) => {
  try {
    const filter = {
      organization: req.user.organization._id,
      user: req.user._id,
      read: false,
    };
    const [count, notifications] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.find(filter).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    res.json({ ok: true, count, data: notifications });
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications — List notifications with optional read filter
router.get('/', async (req, res, next) => {
  try {
    const filter = {
      organization: req.user.organization._id,
      user: req.user._id,
    };
    if (req.query.unread === 'true') {
      filter.read = false;
    }
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const count = await Notification.countDocuments({
      organization: req.user.organization._id,
      user: req.user._id,
      read: false,
    });

    res.json({ ok: true, data: notifications, count });
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications/:id/read — Mark single notification as read
router.post('/:id/read', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    await Notification.updateOne(
      { _id: req.params.id, organization: orgId, user: req.user._id },
      { read: true }
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications/read-all — Mark all notifications as read
router.post('/read-all', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    await Notification.updateMany(
      { organization: orgId, user: req.user._id, read: false },
      { read: true }
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
