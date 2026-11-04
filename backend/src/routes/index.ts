import { Router } from 'express';
import { AVATAR_MAX_BYTES } from '@expenseflow/shared';
import { authController } from '../controllers/auth.controller';
import {
  analyticsController,
  budgetController,
  categoryController,
  exportController,
  notificationController,
  recurringController,
  syncController,
  transactionController,
} from '../controllers/domain.controller';
import { userController } from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth';
import { authLimiter, emailLimiter } from '../middleware/rateLimit';
import { singleFileUpload } from '../middleware/upload';

export function apiRouter(): Router {
  const api = Router();

  // ── auth (public) ──
  const auth = Router();
  auth.get('/csrf', authController.csrf);
  auth.post('/register', authLimiter, authController.register);
  auth.post('/login', authLimiter, authController.login);
  auth.post('/refresh', authController.refresh);
  auth.post('/logout', authController.logout);
  auth.post('/forgot-password', emailLimiter, authController.forgotPassword);
  auth.post('/reset-password', authLimiter, authController.resetPassword);
  auth.post('/verify-email', authLimiter, authController.verifyEmail);
  auth.post('/resend-verification', requireAuth, emailLimiter, authController.resendVerification);
  auth.post('/logout-all', requireAuth, authController.logoutAll);
  api.use('/auth', auth);

  // ── everything below requires a verified session ──
  const priv = Router();
  priv.use(requireAuth);

  priv.get('/users/me', userController.me);
  priv.patch('/users/me', userController.update);
  priv.delete('/users/me', userController.remove);
  priv.post('/users/me/password', authLimiter, userController.changePassword);
  priv.post('/users/me/email', authLimiter, userController.changeEmail);
  priv.get('/users/me/avatar', userController.avatar);
  priv.post('/users/me/avatar', singleFileUpload('file', AVATAR_MAX_BYTES), userController.uploadAvatar);
  priv.delete('/users/me/avatar', userController.removeAvatar);

  priv.get('/transactions', transactionController.list);
  priv.post('/transactions', transactionController.create);
  priv.get('/transactions/:id', transactionController.get);
  priv.put('/transactions/:id', transactionController.update);
  priv.delete('/transactions/:id', transactionController.remove);
  priv.get('/transactions/:id/receipt', transactionController.receipt);
  priv.post('/transactions/:id/receipt', singleFileUpload('file'), transactionController.uploadReceipt);
  priv.delete('/transactions/:id/receipt', transactionController.removeReceipt);

  priv.get('/sync/pull', syncController.pull);

  priv.get('/categories', categoryController.list);
  priv.post('/categories', categoryController.create);
  priv.put('/categories/:id', categoryController.update);
  priv.delete('/categories/:id', categoryController.remove);

  priv.get('/budgets', budgetController.list);
  priv.post('/budgets', budgetController.create);
  priv.put('/budgets/:id', budgetController.update);
  priv.delete('/budgets/:id', budgetController.remove);

  priv.get('/recurring', recurringController.list);
  priv.post('/recurring', recurringController.create);
  priv.put('/recurring/:id', recurringController.update);
  priv.delete('/recurring/:id', recurringController.remove);

  priv.get('/analytics/overview', analyticsController.overview);
  priv.get('/analytics/monthly', analyticsController.monthly);
  priv.get('/analytics/categories', analyticsController.categories);
  priv.get('/analytics/trends', analyticsController.trends);
  priv.get('/analytics/insights', analyticsController.insights);

  priv.get('/notifications', notificationController.list);
  priv.patch('/notifications/:id/read', notificationController.markRead);
  priv.post('/notifications/read-all', notificationController.markAllRead);
  priv.delete('/notifications/:id', notificationController.remove);

  priv.get('/export/transactions', exportController.transactions);

  api.use(priv);
  return api;
}
