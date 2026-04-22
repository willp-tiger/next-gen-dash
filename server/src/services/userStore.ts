import type { UserProfile } from '../../../shared/types.js';

interface StoredUser {
  profile: UserProfile;
  password: string;
}

const users = new Map<string, StoredUser>();

export function registerUser(email: string, displayName: string, password: string): UserProfile {
  const now = new Date().toISOString();
  const profile: UserProfile = {
    email,
    displayName,
    createdAt: now,
    lastLoginAt: now,
  };
  users.set(email.toLowerCase(), { profile, password });
  return profile;
}

export function loginUser(email: string, password: string): UserProfile | null {
  const stored = users.get(email.toLowerCase());
  if (!stored || stored.password !== password) return null;
  stored.profile.lastLoginAt = new Date().toISOString();
  return stored.profile;
}

export function getUser(email: string): UserProfile | null {
  return users.get(email.toLowerCase())?.profile ?? null;
}

export function userExists(email: string): boolean {
  return users.has(email.toLowerCase());
}
