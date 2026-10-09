import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { api } from '../../lib/apiClient.js';
import { Modal } from '../ui/Modal.js';
import { Input } from '../ui/Input.js';
import { Button } from '../ui/Button.js';
import { useToast } from '../../contexts/ToastContext.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';
import { Camera, Trash2, Loader2 } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, updateUser } = useAuth();
  const { success, error: toastError } = useToast();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setFormError(null);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'User';
  const initials = (user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase();

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormError('Image size exceeds 5MB limit.');
      return;
    }

    setIsUploadingPhoto(true);
    setFormError(null);

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const res = await api.post<{
        avatarUrl: string;
        user: any;
      }>('/auth/avatar', formData);

      if (res && res.avatarUrl) {
        updateUser({ avatarUrl: res.avatarUrl });
        success('Profile photo updated successfully!');
      }
    } catch (err: any) {
      const msg = getFriendlyErrorMessage(err) || 'Failed to upload profile photo.';
      setFormError(msg);
      toastError(msg);
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setIsRemovingPhoto(true);
    setFormError(null);

    try {
      await api.delete('/auth/avatar');
      updateUser({ avatarUrl: null });
      success('Profile photo removed successfully.');
    } catch (err: any) {
      const msg = getFriendlyErrorMessage(err) || 'Failed to remove profile photo.';
      setFormError(msg);
      toastError(msg);
    } finally {
      setIsRemovingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setFormError('First name is required.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const res = await api.patch<{
        id: string;
        firstName: string;
        lastName: string;
        avatarUrl?: string | null;
      }>('/auth/profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      if (res) {
        updateUser({
          firstName: res.firstName,
          lastName: res.lastName,
        });
        success('Profile updated successfully!');
        onClose();
      }
    } catch (err: any) {
      const msg = getFriendlyErrorMessage(err) || 'Failed to update profile.';
      setFormError(msg);
      toastError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Profile Settings"
      description="Manage your account profile details and avatar photo."
      size="md"
    >
      <div className="space-y-6">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
            {formError}
          </div>
        )}

        {/* Avatar Section */}
        <div className="flex flex-col items-center justify-center gap-3.5 pb-2">
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 border-2 border-blue-400 flex items-center justify-center text-3xl font-black text-white overflow-hidden shadow-lg shadow-blue-600/20">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isUploadingPhoto || isRemovingPhoto}
              onClick={() => fileInputRef.current?.click()}
              leftIcon={
                isUploadingPhoto ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5 text-blue-600" />
                )
              }
              className="font-bold cursor-pointer"
            >
              {user?.avatarUrl ? 'Change Photo' : 'Upload Photo'}
            </Button>

            {user?.avatarUrl && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isUploadingPhoto || isRemovingPhoto}
                onClick={handleRemovePhoto}
                leftIcon={
                  isRemovingPhoto ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  )
                }
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 font-bold cursor-pointer"
                title="Remove profile picture"
              >
                Remove
              </Button>
            )}
          </div>
        </div>

        {/* Edit Profile Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First Name"
              required
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />

            <Input
              label="Last Name"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <Input
            label="Email Address"
            type="email"
            value={user?.email || ''}
            disabled
            helperText="Email address cannot be changed directly."
          />

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSaving}
              className="font-medium cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSaving}
              disabled={isSaving || !firstName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/25 cursor-pointer"
            >
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default ProfileModal;
