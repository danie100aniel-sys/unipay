const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); // Assuming bcrypt is used for password hashing

// Middleware: Strictly restrict to Superadmins
function requireSuperAdmin(req, res, next) {
  if (!req.admin || req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Forbidden: Superadmin access required' });
  }
  next();
}

// 1. List all users with status
router.get('/users', requireSuperAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT admin_id, username, role, lock_timeout_minutes, is_active, created_at FROM admin_users ORDER BY created_at DESC`
    );
    res.json({ success: true, users: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/sites', async (req, res, next) => {
  try {
    // Fallback to generic column selection matching standard merchant_keys structure
    const { rows } = await db.query(`SELECT * FROM merchant_keys ORDER BY created_at DESC`);
    res.json({ success: true, sites: rows });
  } catch (e) {
    next(e);
  }
});

// 2. Create a new user
router.post('/users', requireSuperAdmin, async (req, res) => {
  try {
    const { username, password, role, lock_timeout_minutes } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await db.query(
      'INSERT INTO admin_table (username, password_hash, role, lock_timeout_minutes, is_active, created_at) VALUES ($1, $2, $3, $4, true, NOW()) RETURNING id, username, role, is_active, created_at',
      [username, hashedPassword, role || 'admin', lock_timeout_minutes || 3]
    );

    res.json({ success: true, admin: newAdmin.rows[0] || newAdmin[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Change a user's password
router.put('/users/:id/password', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ success: false, message: 'New password is required' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.query(
      'UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, id]
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Activate or freeze account (Toggle status)
router.patch('/users/:id/status', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body; // Expects a boolean (true to activate, false to freeze)

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Invalid status value provided' });
    }

    const updatedUser = await db.query(
      'UPDATE admins SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, is_active',
      [is_active, id]
    );

    res.json({ success: true, user: updatedUser.rows[0] || updatedUser[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;