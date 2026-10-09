import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '../ui/Modal.js';
import { Input } from '../ui/Input.js';
import { Button } from '../ui/Button.js';
import { api } from '../../lib/apiClient.js';
import { useToast } from '../../contexts/ToastContext.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one digit'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export const ChangePasswordModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { success, error } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    try {
      setIsSubmitting(true);
      await api.patch('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      success('Password updated successfully!');
      reset();
      onClose();
    } catch (err) {
      error(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Change Password" size="sm">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          type="password"
          label="Current Password"
          required
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />

        <Input
          type="password"
          label="New Password"
          required
          autoComplete="new-password"
          helperText="Min 8 characters with upper, lower, & digit"
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />

        <Input
          type="password"
          label="Confirm New Password"
          required
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div className="flex items-center justify-end gap-3 pt-3">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Update Password
          </Button>
        </div>
      </form>
    </Modal>
  );
};
