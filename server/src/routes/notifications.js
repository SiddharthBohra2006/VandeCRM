const express = require('express');
const Notification = require('../models/Notification');
const router = express.Router();

router.get('/feed', async (req, res, next) => {
  try {
    const filter = { organization: req.user.organization._id, user: req.user._id, read: false };
    res.json({ count: await Notification.countDocuments(filter) });
  } catch (error) { next(error); }
});

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

router.post('/read-all', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    await Notification.updateMany(
      { organization: orgId, user: req.user._id },
      { read: true }
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
