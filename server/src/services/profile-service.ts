import { CURRENT_WORLD, playerPath } from '../data/current-world.js';
import type { DocumentStore } from '../data/store.js';
import { GameError } from '../domain/errors.js';
import type { Portfolio } from '../domain/model.js';

export interface PlayerProfile {
  displayName: string;
  photoDataUrl: string | null;
}

interface ProfileInput {
  displayName: string;
  photoDataUrl?: string | null;
}

const MAX_PHOTO_BYTES = 32 * 1024;
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function validatePhoto(photo: string | null | undefined) {
  if (photo === null || photo === undefined) return;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match || photo.length > 44_000) {
    throw new GameError('INVALID_PROFILE_PHOTO', 'Choose a small JPEG or PNG profile photo.', 400);
  }
  const content = match[2]!;
  const bytes = Buffer.from(content, 'base64');
  const validHeader =
    match[1] === 'png'
      ? bytes.subarray(0, PNG_HEADER.length).equals(PNG_HEADER)
      : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (bytes.length > MAX_PHOTO_BYTES || content !== bytes.toString('base64') || !validHeader) {
    throw new GameError('INVALID_PROFILE_PHOTO', 'The profile photo must be a JPEG or PNG under 32 KB.', 400);
  }
}

export class ProfileService {
  constructor(private readonly store: DocumentStore) {}

  async get(uid: string): Promise<PlayerProfile> {
    return (await this.store.get<PlayerProfile>(`profiles/${uid}`)) ?? { displayName: '', photoDataUrl: null };
  }

  async save(uid: string, input: ProfileInput): Promise<PlayerProfile> {
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 40) {
      throw new GameError('INVALID_DISPLAY_NAME', 'Your display name must contain 2 to 40 characters.', 400);
    }
    validatePhoto(input.photoDataUrl);

    return this.store.transaction(async tx => {
      const existing = await tx.get<PlayerProfile>(`profiles/${uid}`);
      const pointer = await tx.get<{ worldId: string }>(CURRENT_WORLD);
      const path = pointer ? playerPath(pointer.worldId, uid) : null;
      const player = path ? await tx.get<Portfolio>(path) : undefined;
      const profile = {
        displayName,
        photoDataUrl: input.photoDataUrl === undefined ? (existing?.photoDataUrl ?? null) : input.photoDataUrl,
      };

      // all reads happen before writes; only the player's name changes here.
      tx.set(`profiles/${uid}`, profile);
      if (player && path) tx.set(path, { ...player, displayName });
      return profile;
    });
  }
}
