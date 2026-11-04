import { changeEmailSchema, changePasswordSchema, deleteAccountSchema, updateProfileSchema } from '@expenseflow/shared';
import { toUserDTO } from '../services/mappers';
import { userService } from '../services/user.service';
import { clearAuthCookies } from '../utils/cookies';
import { asyncHandler, parseBody, userId } from '../utils/http';

export const userController = {
  me: asyncHandler(async (req, res) => {
    res.json({ user: toUserDTO(await userService.requireUser(userId(req))) });
  }),

  update: asyncHandler(async (req, res) => {
    const input = parseBody(updateProfileSchema, req);
    res.json({ user: toUserDTO(await userService.updateProfile(userId(req), input)) });
  }),

  changePassword: asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, req);
    await userService.changePassword(userId(req), req.user!.sessionId, currentPassword, newPassword);
    res.json({ message: 'Password changed. Other devices were signed out.' });
  }),

  changeEmail: asyncHandler(async (req, res) => {
    const { email, password } = parseBody(changeEmailSchema, req);
    res.json({ user: toUserDTO(await userService.changeEmail(userId(req), email, password)) });
  }),

  remove: asyncHandler(async (req, res) => {
    const { password } = parseBody(deleteAccountSchema, req);
    await userService.deleteAccount(userId(req), password);
    clearAuthCookies(res);
    res.status(204).end();
  }),

  uploadAvatar: asyncHandler(async (req, res) => {
    res.json({ user: toUserDTO(await userService.setAvatar(userId(req), req.file)) });
  }),

  removeAvatar: asyncHandler(async (req, res) => {
    res.json({ user: toUserDTO(await userService.removeAvatar(userId(req))) });
  }),

  avatar: asyncHandler(async (req, res) => {
    const file = await userService.getAvatar(userId(req));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.data);
  }),
};
