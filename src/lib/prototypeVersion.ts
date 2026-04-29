/** In-app prototype variants — switched from `Layout` (state only, no URL). */
export const PROTOTYPE_VERSION_IDS = ['v1', 'v1b', 'v2', 'v3', 'v4'] as const;
export type PrototypeVersionId = (typeof PROTOTYPE_VERSION_IDS)[number];

export const PROTOTYPE_VERSION_LABELS: Record<PrototypeVersionId, string> = {
  v1: 'V1',
  v1b: 'V1-B',
  v2: 'V2',
  v3: 'V3',
  v4: 'V4',
};
