import express from 'express';
import passport from 'passport';
import { register, login, oauthCallback, logout, getCurrentUser } from '../controllers/auth.controller.js';
import auth from '../middleware/auth.middleware.js';

const router = express.Router();

// Keep existing routes
router.post('/register', register);
router.post('/login', login);

// Add OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  oauthCallback
);

router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login', session: false }),
  oauthCallback
);

// Get current user
router.get('/me', auth, getCurrentUser);

// Logout route
router.get('/logout', logout);

export default router;