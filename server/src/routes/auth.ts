import { Router } from 'express';
import type { AuthResponse } from '../../../shared/types.js';
import { registerUser, loginUser, userExists } from '../services/userStore.js';
import { getConfig } from '../services/configStore.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const profile = loginUser(email, password);
  if (!profile) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const config = getConfig(email.toLowerCase());
  const response: AuthResponse = {
    profile,
    hasConfig: !!config,
    config: config ?? undefined,
  };
  return res.json(response);
});

router.post('/register', (req, res) => {
  const { email, displayName, password } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Email, display name, and password are required' });
  }

  if (userExists(email)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const profile = registerUser(email, displayName, password);
  const response: AuthResponse = {
    profile,
    hasConfig: false,
  };
  return res.json(response);
});

router.post('/logout', (_req, res) => {
  return res.json({ ok: true });
});

export default router;
