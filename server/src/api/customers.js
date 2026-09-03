// customers.js — BOOT STUB
// OWNER: Codex (per CODEX-TASKS.md Task 2)
// This file exists ONLY so the server boots while Codex implements the real
// Customers API. It returns a clear "not implemented" response. Codex must
// REPLACE this entire file with the real implementation (see CODEX-TASKS.md).
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.status(501).json({ ok: false, error: 'Customers API not implemented yet. Owner: Codex (see CODEX-TASKS.md).' });
});

module.exports = router;
